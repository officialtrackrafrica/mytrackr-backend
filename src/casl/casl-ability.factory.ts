import {
  AbilityBuilder,
  ExtractSubjectType,
  InferSubjects,
  MongoAbility,
  createMongoAbility,
} from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { User } from '../auth/entities/user.entity';
import { Action } from './action.enum';

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
type Subjects = InferSubjects<any> | 'all';

export type AppAbility = MongoAbility<[Action, Subjects]>;

/**
 * Defines hardcoded base permissions per role name.
 * These serve as the source of truth — DB `role.permissions` are applied on top as overrides.
 */
const ROLE_PERMISSIONS: Record<
  string,
  Array<{
    action: Action | Action[];
    subject: string;
    conditions?: Record<string, any>;
    inverted?: boolean;
  }>
> = {
  'Super Admin': [{ action: Action.Manage, subject: 'all' }],

  Admin: [{ action: Action.Manage, subject: 'all' }],

  Staff: [
    { action: Action.Read, subject: 'all' },
    { action: Action.Update, subject: 'User' },
  ],

  User: [
    { action: Action.Read, subject: 'User' },
    { action: Action.Update, subject: 'User' },
    { action: Action.Read, subject: 'Session' },
    { action: Action.Delete, subject: 'Session' },
    { action: Action.Read, subject: 'Mfa' },
    { action: Action.Create, subject: 'Mfa' },
    { action: Action.Update, subject: 'Mfa' },
    { action: Action.Delete, subject: 'Mfa' },
  ],
};

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: User) {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      createMongoAbility,
    );

    if (user.roles && user.roles.length > 0) {
      user.roles.forEach((role) => {
        const basePermissions = ROLE_PERMISSIONS[role.name];
        if (basePermissions) {
          basePermissions.forEach((perm) => {
            if (perm.inverted) {
              cannot(perm.action as Action, perm.subject, perm.conditions);
            } else {
              can(perm.action as Action, perm.subject, perm.conditions);
            }
          });
        }

        if (role.permissions && role.permissions.length > 0) {
          role.permissions.forEach((permission) => {
            if (permission.inverted) {
              cannot(
                permission.action,
                permission.subject,
                permission.conditions,
              );
            } else {
              can(permission.action, permission.subject, permission.conditions);
            }
          });
        }
      });
    } else {
      can(Action.Read, 'User', { id: user.id });
      can(Action.Update, 'User', { id: user.id });
    }

    return build({
      detectSubjectType: (item) =>
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        item.constructor as ExtractSubjectType<Subjects>,
    });
  }
}
