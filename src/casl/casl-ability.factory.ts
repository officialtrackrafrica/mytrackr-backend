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

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: User) {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      createMongoAbility,
    );

    if (user.roles && user.roles.length > 0) {
      user.roles.forEach((role) => {
        if (role.permissions) {
          role.permissions.forEach((permission) => {
            // permission is a RawRule object like { action: 'read', subject: 'Article' }
            // checking if inverted (cannot)
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
      // Default permissions for users without roles
      can(Action.Read, User, { id: user.id });
      can(Action.Update, User, { id: user.id });
    }

    // Always allow users to read/update their own profile regardless of roles
    can(Action.Read, User, { id: user.id });
    can(Action.Update, User, { id: user.id });

    return build({
      detectSubjectType: (item) =>
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        item.constructor as ExtractSubjectType<Subjects>,
    });
  }
}
