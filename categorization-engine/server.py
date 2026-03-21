import grpc
from concurrent import futures
import categorization_pb2
import categorization_pb2_grpc
import pickle
import os
import logging
import math
from typing import Dict, Tuple, Set

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("CategorizationEngine")

MODEL_PATH = "data/model.pkl"

if not os.path.exists("data"):
    os.makedirs("data")

class DynamicNaiveBayes:
    def __init__(self) -> None:
        self.class_doc_counts: Dict[str, int] = {}
        self.word_counts: Dict[str, Dict[str, int]] = {}
        self.vocab: Set[str] = set()
        self.total_docs: int = 0

    def partial_fit(self, text: str, category: str) -> None:
        words = str(text).lower().split()
        if category not in self.class_doc_counts:
            self.class_doc_counts[category] = 0
            self.word_counts[category] = {}
            
        self.class_doc_counts[category] += 1
        self.total_docs += 1
        
        for word in words:
            if word not in self.word_counts[category]:
                self.word_counts[category][word] = 0
            self.word_counts[category][word] += 1
            self.vocab.add(word)

    def predict(self, text: str) -> Tuple[str, float]:
        if self.total_docs == 0:
            return "Uncategorized", 0.0
            
        words = str(text).lower().split()
        scores: Dict[str, float] = {}
        
        for category, cat_count in self.class_doc_counts.items():
            score: float = math.log(cat_count / self.total_docs)
            total_words_in_cat: int = sum(self.word_counts[category].values())
            V: int = len(self.vocab)
            
            for word in words:
                word_count: int = self.word_counts[category].get(word, 0)
                prob: float = (word_count + 1) / (total_words_in_cat + V + 1)
                score += math.log(prob)
                
            scores[category] = score
                
          # Standard Naive Bayes normalization with Softmax
        # We find the max_log to avoid overflow in exp()
        max_log: float = float(max(scores.values()))
        exps: Dict[str, float] = {cat: math.exp(float(s) - max_log) for cat, s in scores.items()}
        sum_exps: float = float(sum(exps.values()))
        
        best_category: str = "Uncategorized"
        best_score: float = float('-inf')
        for cat, sc in scores.items():
            if float(sc) > best_score:
                best_score = float(sc)
                best_category = cat
                
        confidence: float = 0.0
        if sum_exps > 0 and best_category in exps:
            confidence = float(exps[best_category] / sum_exps)
        
        return best_category, confidence

class CategorizationServicer(categorization_pb2_grpc.CategorizationServiceServicer):
    def __init__(self):
        self.model = DynamicNaiveBayes()
        if os.path.exists(MODEL_PATH):
            logger.info("Loading existing dynamic model from disk...")
            try:
                with open(MODEL_PATH, "rb") as f:
                    self.model = pickle.load(f)
            except Exception as e:
                logger.error(f"Failed to load model: {e}")
        else:
            logger.info("Initializing blank dynamic model...")

    def PredictCategory(self, request, context):
        narration = request.narration
        logger.info(f"Predicting for narration: {narration}")
        
        category, confidence = self.model.predict(narration)
        
        logger.info(f"Predicted: {category} ({confidence*100:.2f}%)")
        return categorization_pb2.PredictResponse(
            category=category, 
            confidence=confidence
        )

    def LearnTransaction(self, request, context):
        narration = request.narration
        correct_category = request.correctCategory
        logger.info(f"Learning feedback: '{narration}' -> '{correct_category}'")

        # The model naturally accepts infinite new categories dynamically!
        self.model.partial_fit(narration, correct_category)
        
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(self.model, f)
            
        return categorization_pb2.LearnResponse(success=True)

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    categorization_pb2_grpc.add_CategorizationServiceServicer_to_server(CategorizationServicer(), server)
    port = '[::]:50051'
    server.add_insecure_port(port)
    logger.info(f"Python Dynamic Categorization Engine running on port {port}...")
    server.start()
    server.wait_for_termination()

if __name__ == '__main__':
    serve()
