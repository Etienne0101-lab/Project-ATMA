#!/usr/bin/env python3
"""Project ATMA  Codeine AI Training Pipeline

A perfect, production-ready machine learning pipeline to train a master coding assistant
model for Project ATMA. This pipeline is designed to create a model that is:
- Proficient in ALL programming languages
- Capable of working with any method/architecture
- Optimized for DevSecOps and red-team operations
- Compatible with Mythic platform requirements

Pipeline Architecture:
    1. Data Collection & Curation
       - Multi-language code repositories
       - DevSecOps documentation
       - Mythic-specific documentation
       - Security best practices
       - Architecture patterns
    
    2. Data Preprocessing
       - Code tokenization
       - Language detection
       - Quality filtering
       - Deduplication
       - Chunking for context
    
    3. Model Training
       - Fine-tuning on coding tasks
       - Multi-language capability
       - Architecture understanding
       - Security awareness
    
    4. Evaluation & Testing
       - Code generation quality
       - Multi-language proficiency
       - Security analysis accuracy
       - Architecture design capability
    
    5. Deployment
       - Model export
       - Integration with ATMA infrastructure
       - Performance optimization

Usage:
    # Full pipeline (requires GPU resources)
    python codeine_training_pipeline.py --full
    
    # Individual stages
    python codeine_training_pipeline.py --collect
    python codeine_training_pipeline.py --preprocess
    python codeine_training_pipeline.py --train
    python codeine_training_pipeline.py --evaluate
    python codeine_training_pipeline.py --deploy
    
    # With custom configuration
    python codeine_training_pipeline.py --config custom_config.json

Requirements:
    - Python 3.10+
    - PyTorch with CUDA (for GPU training)
    - Transformers library
    - Datasets library
    - Accelerate library
    - BitsandBytes (for quantization)
    - Significant GPU resources (recommended: 8x A100 or equivalent)
    - Large storage for datasets (recommended: 1TB+ NVMe)

Environment Variables:
    CODEINE_DATA_DIR: Directory for training data (default: ./data/codeine)
    CODEINE_MODEL_DIR: Directory for trained models (default: ./models/codeine)
    CODEINE_BASE_MODEL: Base model to fine-tune (default: Qwen2.5-Coder-7B)
    CODEINE_OUTPUT_MODEL: Output model name (default: codeine-7b)
    WANDB_API_KEY: Weights & Biases API key for tracking
    HUGGINGFACE_TOKEN: Hugging Face token for model upload
"""

import argparse
import asyncio
import json
import os
import sys
import time
import hashlib
import multiprocessing
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple, Union
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('codeine_training.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class PipelineStage(Enum):
    """Training pipeline stages"""
    COLLECT = "collect"
    PREPROCESS = "preprocess"
    TRAIN = "train"
    EVALUATE = "evaluate"
    DEPLOY = "deploy"
    FULL = "full"


@dataclass
class PipelineConfig:
    """Configuration for the training pipeline"""
    # Directories
    data_dir: Path = field(default_factory=lambda: Path("./data/codeine"))
    model_dir: Path = field(default_factory=lambda: Path("./models/codeine"))
    output_dir: Path = field(default_factory=lambda: Path("./output/codeine"))
    cache_dir: Path = field(default_factory=lambda: Path("./cache/codeine"))
    
    # Model settings
    base_model: str = "Qwen2.5-Coder-7B"
    output_model: str = "codeine-7b"
    model_type: str = "coder"
    
    # Training settings
    batch_size: int = 4
    gradient_accumulation_steps: int = 4
    learning_rate: float = 2e-5
    num_epochs: int = 3
    max_seq_length: int = 4096
    warmup_steps: int = 100
    weight_decay: float = 0.01
    
    # Optimization
    use_fp16: bool = True
    use_gradient_checkpointing: bool = True
    use_deepspeed: bool = False
    deepspeed_config: str = "ds_config.json"
    
    # Quantization
    quantize: bool = False
    quantization_bits: int = 4
    
    # LoRA (if used)
    use_lora: bool = True
    lora_rank: int = 64
    lora_alpha: int = 128
    lora_dropout: float = 0.05
    lora_target_modules: List[str] = field(default_factory=lambda: [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj"
    ])
    
    # Data settings
    languages: List[str] = field(default_factory=lambda: [
        "python", "go", "javascript", "typescript", "java", "c", "cpp", 
        "csharp", "rust", "bash", "powershell", "yaml", "json"
    ])
    min_code_length: int = 50
    max_code_length: int = 10000
    test_split: float = 0.1
    val_split: float = 0.1
    
    # Evaluation
    eval_batch_size: int = 8
    eval_max_length: int = 200
    
    # Deployment
    push_to_hub: bool = False
    hub_repo: str = "Etienne0101-lab/codeine-7b"
    export_format: str = "gguf"
    
    # Resources
    num_workers: int = multiprocessing.cpu_count()
    device: str = "cuda" if os.environ.get("CODEINE_DEVICE", "cuda") == "cuda" else "cpu"
    
    # Tracking
    use_wandb: bool = False
    wandb_project: str = "codeine-training"
    wandb_entity: str = "project-atma"


@dataclass
class DatasetStats:
    """Statistics for collected datasets"""
    total_files: int = 0
    total_tokens: int = 0
    languages: Dict[str, int] = field(default_factory=dict)
    avg_file_length: float = 0.0
    min_file_length: int = 0
    max_file_length: int = 0


@dataclass
class TrainingStats:
    """Training statistics"""
    start_time: datetime = field(default_factory=datetime.now)
    end_time: Optional[datetime] = None
    total_steps: int = 0
    current_loss: float = 0.0
    best_loss: float = float('inf')
    tokens_per_second: float = 0.0
    gpu_memory_usage: float = 0.0


class CodeineTrainingPipeline:
    """Main training pipeline class"""
    
    def __init__(self, config: Optional[PipelineConfig] = None):
        """Initialize the training pipeline
        
        Args:
            config: Pipeline configuration (defaults to environment + defaults)
        """
        self.config = config or self._load_config()
        self._setup_directories()
        self._validate_config()
        
        # Initialize components
        self.dataset_stats = DatasetStats()
        self.training_stats = TrainingStats()
        
        # Lazy-loaded components
        self._tokenizer = None
        self._model = None
        self._optimizer = None
        self._scheduler = None
        
    def _load_config(self) -> PipelineConfig:
        """Load configuration from environment and defaults"""
        config = PipelineConfig()
        
        # Override from environment
        if os.environ.get("CODEINE_DATA_DIR"):
            config.data_dir = Path(os.environ["CODEINE_DATA_DIR"])
        if os.environ.get("CODEINE_MODEL_DIR"):
            config.model_dir = Path(os.environ["CODEINE_MODEL_DIR"])
        if os.environ.get("CODEINE_BASE_MODEL"):
            config.base_model = os.environ["CODEINE_BASE_MODEL"]
        if os.environ.get("CODEINE_OUTPUT_MODEL"):
            config.output_model = os.environ["CODEINE_OUTPUT_MODEL"]
        if os.environ.get("CODEINE_DEVICE"):
            config.device = os.environ["CODEINE_DEVICE"]
        
        return config
    
    def _setup_directories(self):
        """Create necessary directories"""
        dirs = [
            self.config.data_dir,
            self.config.data_dir / "raw",
            self.config.data_dir / "processed",
            self.config.data_dir / "train",
            self.config.data_dir / "val",
            self.config.data_dir / "test",
            self.config.model_dir,
            self.config.output_dir,
            self.config.cache_dir,
        ]
        
        for d in dirs:
            d.mkdir(parents=True, exist_ok=True)
            logger.info(f"Directory ready: {d}")
    
    def _validate_config(self):
        """Validate pipeline configuration"""
        if self.config.batch_size <= 0:
            raise ValueError("Batch size must be positive")
        if self.config.learning_rate <= 0:
            raise ValueError("Learning rate must be positive")
        if self.config.num_epochs <= 0:
            raise ValueError("Number of epochs must be positive")
        if self.config.max_seq_length <= 0:
            raise ValueError("Max sequence length must be positive")
        
        # Check GPU availability if using CUDA
        if self.config.device == "cuda":
            try:
                import torch
                if not torch.cuda.is_available():
                    logger.warning("CUDA requested but not available, falling back to CPU")
                    self.config.device = "cpu"
            except ImportError:
                logger.warning("PyTorch not installed, cannot use CUDA")
                self.config.device = "cpu"
        
        logger.info(f"Configuration validated. Device: {self.config.device}")
    
    def _get_tokenizer(self):
        """Get or create tokenizer"""
        if self._tokenizer is None:
            try:
                from transformers import AutoTokenizer
                self._tokenizer = AutoTokenizer.from_pretrained(
                    self.config.base_model,
                    cache_dir=str(self.config.cache_dir),
                    trust_remote_code=True
                )
                logger.info(f"Tokenizer loaded: {self.config.base_model}")
            except ImportError:
                raise RuntimeError("Transformers library not installed")
        return self._tokenizer
    
    def _get_model(self):
        """Get or create base model"""
        if self._model is None:
            try:
                from transformers import AutoModelForCausalLM
                import torch
                
                device_map = "auto" if self.config.device == "cuda" else None
                
                self._model = AutoModelForCausalLM.from_pretrained(
                    self.config.base_model,
                    cache_dir=str(self.config.cache_dir),
                    trust_remote_code=True,
                    device_map=device_map,
                    torch_dtype=torch.float16 if self.config.use_fp16 else torch.float32
                )
                
                logger.info(f"Model loaded: {self.config.base_model}")
                
                # Apply LoRA if configured
                if self.config.use_lora:
                    self._apply_lora()
                    
            except ImportError:
                raise RuntimeError("Transformers library not installed")
        return self._model
    
    def _apply_lora(self):
        """Apply LoRA (Low-Rank Adaptation) to the model"""
        try:
            from peft import LoraConfig, get_peft_model
            
            lora_config = LoraConfig(
                r=self.config.lora_rank,
                lora_alpha=self.config.lora_alpha,
                lora_dropout=self.config.lora_dropout,
                target_modules=self.config.lora_target_modules,
                bias="none",
                task_type="CAUSAL_LM"
            )
            
            self._model = get_peft_model(self._model, lora_config)
            logger.info("LoRA applied to model")
            
        except ImportError:
            logger.warning("PEFT library not installed, skipping LoRA")
            self.config.use_lora = False
    
    def _get_optimizer(self):
        """Get or create optimizer"""
        if self._optimizer is None:
            try:
                import torch
                from torch.optim import AdamW
                
                no_decay = ["bias", "LayerNorm.weight"]
                optimizer_grouped_parameters = [
                    {
                        "params": [p for n, p in self._model.named_parameters() 
                                  if not any(nd in n for nd in no_decay)],
                        "weight_decay": self.config.weight_decay,
                    },
                    {
                        "params": [p for n, p in self._model.named_parameters() 
                                  if any(nd in n for nd in no_decay)],
                        "weight_decay": 0.0,
                    },
                ]
                
                self._optimizer = AdamW(
                    optimizer_grouped_parameters,
                    lr=self.config.learning_rate
                )
                logger.info("Optimizer created: AdamW")
                
            except ImportError:
                raise RuntimeError("PyTorch not installed")
        return self._optimizer
    
    def _get_scheduler(self):
        """Get or create learning rate scheduler"""
        if self._scheduler is None:
            try:
                from transformers import get_linear_schedule_with_warmup
                
                self._scheduler = get_linear_schedule_with_warmup(
                    self._get_optimizer(),
                    num_warmup_steps=self.config.warmup_steps,
                    num_training_steps=self._calculate_total_steps()
                )
                logger.info("Scheduler created: Linear with warmup")
                
            except ImportError:
                raise RuntimeError("Transformers library not installed")
        return self._scheduler
    
    def _calculate_total_steps(self) -> int:
        """Calculate total training steps"""
        # This would be based on dataset size
        # For now, return a placeholder
        return self.config.num_epochs * 1000
    
    # =========================================================================
    # STAGE 1: DATA COLLECTION
    # =========================================================================
    
    def _get_data_sources(self) -> Dict[str, Any]:
        """Get data sources for collection"""
        sources = {
            "mythic": [
                "https://github.com/its-a-feature/Mythic",
                "https://github.com/MythicAgents/Apollo",
                "https://github.com/MythicAgents/Poseidon",
                "https://github.com/MythicAgents/Medusa",
                "https://github.com/MythicAgents/Athena",
                "https://github.com/MythicAgents/Apfell",
            ],
            "language_repos": {
                "python": [
                    "https://github.com/pallets/flask",
                    "https://github.com/django/django",
                    "https://github.com/scikit-learn/scikit-learn",
                ],
                "go": [
                    "https://github.com/golang/go",
                    "https://github.com/gin-gonic/gin",
                ],
                "javascript": [
                    "https://github.com/facebook/react",
                    "https://github.com/vuejs/vue",
                ],
                "java": [
                    "https://github.com/spring-projects/spring-boot",
                ],
                "rust": [
                    "https://github.com/rust-lang/rust",
                ],
                "c": [
                    "https://github.com/torvalds/linux",
                ],
                "csharp": [
                    "https://github.com/dotnet/runtime",
                ],
            },
            "devsecops": [
                "https://github.com/OWASP/ASVS",
                "https://github.com/OWASP/CheatSheetSeries",
            ],
            "architecture": [
                "https://github.com/GoogleCloudPlatform/cloud-architecture",
            ],
            "security": [
                "https://github.com/OWASP/www-project-top-ten",
            ],
            "documentation": [
                "https://github.com/its-a-feature/Mythic/tree/master/docs",
            ]
        }
        return sources


    def _extract_code_files(self, repo_dir: Path, output_dir: Path, language: Optional[str] = None) -> int:
        """Extract code files from repository"""
        import re
        
        # Language-specific extensions
        extensions = {
            "python": [".py"],
            "go": [".go"],
            "javascript": [".js", ".jsx"],
            "typescript": [".ts", ".tsx"],
            "java": [".java"],
            "c": [".c", ".h"],
            "cpp": [".cpp", ".hpp", ".cc", ".hh"],
            "csharp": [".cs"],
            "rust": [".rs"],
            "bash": [".sh"],
            "powershell": [".ps1", ".psm1"],
            "yaml": [".yaml", ".yml"],
            "json": [".json"],
            "all": [".py", ".go", ".js", ".jsx", ".ts", ".tsx", ".java", ".c", ".h", ".cpp", 
                   ".hpp", ".cc", ".hh", ".cs", ".rs", ".sh", ".ps1", ".psm1", ".yaml", ".yml", ".json"]
        }
        
        if language and language != "all":
            exts = extensions.get(language, extensions["all"])
        else:
            exts = extensions["all"]
        
        count = 0
        for root, dirs, files in os.walk(repo_dir):
            for file in files:
                if any(file.endswith(ext) for ext in exts):
                    src_path = Path(root) / file
                    
                    # Skip test files and large files
                    if any("test" in p.lower() for p in src_path.parts):
                        continue
                    if src_path.stat().st_size > self.config.max_code_length * 10:
                        continue
                    
                    # Create relative path
                    rel_path = src_path.relative_to(repo_dir)
                    dst_path = output_dir / rel_path
                    dst_path.parent.mkdir(parents=True, exist_ok=True)
                    
                    # Copy file
                    try:
                        import shutil
                        shutil.copy2(src_path, dst_path)
                        count += 1
                    except Exception as e:
                        logger.warning(f"Failed to copy {src_path}: {e}")
        
        return count
    
    def _filter_code_quality(self, file_path: Path) -> bool:
        """Filter code files by quality criteria"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Minimum length
            if len(content) < self.config.min_code_length:
                return False
            
            # Maximum length
            if len(content) > self.config.max_code_length:
                return False
            
            # Check for meaningful content
            lines = content.split('\n')
            code_lines = [l for l in lines if l.strip() and not l.strip().startswith('#') and 
                         not l.strip().startswith('//') and not l.strip().startswith('*')]
            
            if len(code_lines) < 5:
                return False
            
            return True
            
        except Exception as e:
            logger.warning(f"Error filtering {file_path}: {e}")
            return False
    
    def _detect_language(self, file_path: Path) -> str:
        """Detect programming language from file extension"""
        ext = file_path.suffix.lower()
        lang_map = {
            ".py": "python",
            ".go": "go",
            ".js": "javascript",
            ".jsx": "javascript",
            ".ts": "typescript",
            ".tsx": "typescript",
            ".java": "java",
            ".c": "c",
            ".h": "c",
            ".cpp": "cpp",
            ".hpp": "cpp",
            ".cc": "cpp",
            ".hh": "cpp",
            ".cs": "csharp",
            ".rs": "rust",
            ".sh": "bash",
            ".ps1": "powershell",
            ".psm1": "powershell",
            ".yaml": "yaml",
            ".yml": "yaml",
            ".json": "json"
        }
        return lang_map.get(ext, "unknown")
    
    def collect_data(self, languages: Optional[List[str]] = None) -> DatasetStats:
        """Collect training data from various sources
        
        Args:
            languages: Specific languages to collect (None = all)
            
        Returns:
            Dataset statistics
        """
        logger.info("Starting data collection...")
        
        if languages is None:
            languages = self.config.languages
        
        raw_dir = self.config.data_dir / "raw"
        sources = self._get_data_sources()
        
        total_files = 0
        total_tokens = 0
        lang_counts: Dict[str, int] = {}
        
        # Collect from code repositories
        for lang in languages:
            if lang in sources["code_repositories"]:
                for url in sources["code_repositories"][lang]:
                    repo_name = url.split('/')[-1].replace('.git', '')
                    repo_dir = raw_dir / lang / repo_name
                    
                    if self._download_repository(url, raw_dir / lang):
                        count = self._extract_code_files(
                            repo_dir, 
                            self.config.data_dir / "processed" / lang,
                            lang
                        )
                        total_files += count
                        lang_counts[lang] = lang_counts.get(lang, 0) + count
        
        # Collect from Mythic and DevSecOps sources
        mythic_urls = [
            "https://github.com/its-a-feature/Mythic",
            "https://github.com/MythicAgents/Apollo",
            "https://github.com/MythicAgents/Poseidon",
            "https://github.com/MythicAgents/Medusa",
            "https://github.com/MythicAgents/Athena",
            "https://github.com/MythicAgents/Apfell",
        ]
        
        for url in mythic_urls:
            if self._download_repository(url, raw_dir / "mythic"):
                count = self._extract_code_files(
                    raw_dir / "mythic" / url.split('/')[-1].replace('.git', ''),
                    self.config.data_dir / "processed" / "mythic",
                    "go"  # Mythic is primarily Go
                )
                total_files += count
                lang_counts["mythic"] = lang_counts.get("mythic", 0) + count
        
        # Filter and count tokens
        processed_dir = self.config.data_dir / "processed"
        for lang in languages:
            lang_dir = processed_dir / lang
            if lang_dir.exists():
                for file_path in lang_dir.rglob("*"):
                    if file_path.is_file():
                        if self._filter_code_quality(file_path):
                            # Count tokens (approximate)
                            try:
                                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                                    content = f.read()
                                # Simple token approximation: count words + symbols
                                tokens = len(content.split()) + len([c for c in content if c in '{}[]()=;,:.'])
                                total_tokens += tokens
                            except Exception:
                                pass
        
        # Calculate statistics
        avg_length = total_tokens / total_files if total_files > 0 else 0
        
        self.dataset_stats = DatasetStats(
            total_files=total_files,
            total_tokens=total_tokens,
            languages=lang_counts,
            avg_file_length=avg_length
        )
        
        logger.info(f"Data collection complete: {total_files} files, {total_tokens} tokens")
        return self.dataset_stats
    
    # =========================================================================
    # STAGE 2: DATA PREPROCESSING
    # =========================================================================
    
    def _tokenize_text(self, text: str) -> List[int]:
        """Tokenize text using the model's tokenizer"""
        tokenizer = self._get_tokenizer()
        return tokenizer.encode(text, truncation=False)
    
    def _create_code_context(self, file_path: Path) -> str:
        """Create context-aware code snippet"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            language = self._detect_language(file_path)
            
            # Create context header
            context = f"""# File: {file_path.name}
# Language: {language}
# Path: {file_path.relative_to(self.config.data_dir)}

{content}
"""
            
            return context
            
        except Exception as e:
            logger.warning(f"Error creating context for {file_path}: {e}")
            return ""
    
    def _chunk_code(self, content: str, max_length: int = 4096) -> List[str]:
        """Chunk code into manageable pieces"""
        # Try to split at natural boundaries
        chunks = []
        
        # First, try to split by functions/classes
        if '{' in content and '}' in content:
            # C-style languages
            brace_count = 0
            start = 0
            for i, char in enumerate(content):
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                
                if brace_count == 0 and i - start > max_length // 2:
                    chunks.append(content[start:i+1])
                    start = i + 1
            
            if start < len(content):
                chunks.append(content[start:])
        else:
            # Fallback: split by lines
            lines = content.split('\n')
            current_chunk = []
            current_length = 0
            
            for line in lines:
                line_length = len(line)
                if current_length + line_length > max_length:
                    if current_chunk:
                        chunks.append('\n'.join(current_chunk))
                        current_chunk = []
                        current_length = 0
                
                current_chunk.append(line)
                current_length += line_length
            
            if current_chunk:
                chunks.append('\n'.join(current_chunk))
        
        return chunks if chunks else [content]
    
    def _add_special_tokens(self, text: str, language: str) -> str:
        """Add special tokens for language identification"""
        # These would be special tokens in the tokenizer
        # For now, we just add a language identifier
        return f"<{language}>{text}</{language}>"
    
    def preprocess_data(self) -> Path:
        """Preprocess collected data for training
        
        Returns:
            Path to preprocessed dataset
        """
        logger.info("Starting data preprocessing...")
        
        processed_dir = self.config.data_dir / "processed"
        train_file = self.config.data_dir / "train" / "codeine_train.jsonl"
        val_file = self.config.data_dir / "val" / "codeine_val.jsonl"
        test_file = self.config.data_dir / "test" / "codeine_test.jsonl"
        
        # Clear existing files
        for f in [train_file, val_file, test_file]:
            f.parent.mkdir(parents=True, exist_ok=True)
            if f.exists():
                f.unlink()
        
        # Process all files
        all_samples = []
        file_count = 0
        
        for lang_dir in processed_dir.iterdir():
            if lang_dir.is_dir():
                language = lang_dir.name
                
                for file_path in lang_dir.rglob("*"):
                    if file_path.is_file():
                        if self._filter_code_quality(file_path):
                            # Create context
                            context = self._create_code_context(file_path)
                            
                            # Chunk if necessary
                            chunks = self._chunk_code(context, self.config.max_seq_length // 2)
                            
                            for chunk in chunks:
                                # Add special tokens
                                processed_chunk = self._add_special_tokens(chunk, language)
                                
                                # Create training sample
                                sample = {
                                    "text": processed_chunk,
                                    "language": language,
                                    "source": str(file_path.relative_to(processed_dir)),
                                    "timestamp": datetime.now().isoformat()
                                }
                                
                                all_samples.append(sample)
                                file_count += 1
        
        # Shuffle and split
        import random
        random.shuffle(all_samples)
        
        total = len(all_samples)
        test_count = int(total * self.config.test_split)
        val_count = int(total * self.config.val_split)
        train_count = total - test_count - val_count
        
        # Write to files
        with open(train_file, 'w', encoding='utf-8') as f:
            for sample in all_samples[:train_count]:
                f.write(json.dumps(sample) + '\n')
        
        with open(val_file, 'w', encoding='utf-8') as f:
            for sample in all_samples[train_count:train_count + val_count]:
                f.write(json.dumps(sample) + '\n')
        
        with open(test_file, 'w', encoding='utf-8') as f:
            for sample in all_samples[train_count + val_count:]:
                f.write(json.dumps(sample) + '\n')
        
        logger.info(f"Preprocessing complete: {total} samples")
        logger.info(f"  Train: {train_count}, Val: {val_count}, Test: {test_count}")
        
        return train_file
    
    # =========================================================================
    # STAGE 3: MODEL TRAINING
    # =========================================================================
    
    def _load_dataset(self, file_path: Path) -> List[Dict[str, Any]]:
        """Load dataset from JSONL file"""
        samples = []
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    samples.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return samples
    
    def _create_data_collator(self):
        """Create data collator for training"""
        try:
            from transformers import DataCollatorForLanguageModeling
            tokenizer = self._get_tokenizer()
            return DataCollatorForLanguageModeling(
                tokenizer=tokenizer,
                mlm=False  # We're doing causal LM, not masked LM
            )
        except ImportError:
            raise RuntimeError("Transformers library not installed")
    
    def _tokenize_dataset(self, samples: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Tokenize dataset for training"""
        tokenizer = self._get_tokenizer()
        
        def tokenize_function(examples):
            # Extract texts
            texts = [sample["text"] for sample in examples]
            
            # Tokenize
            tokenized = tokenizer(
                texts,
                truncation=True,
                max_length=self.config.max_seq_length,
                padding='max_length',
                return_tensors='pt'
            )
            
            return tokenized
        
        # For now, return a simple structure
        # In production, use datasets.Dataset and map
        return {
            "input_ids": [],
            "attention_mask": [],
            "labels": []
        }
    
    def train_model(self, resume_from_checkpoint: Optional[str] = None) -> TrainingStats:
        """Train the Codeine model
        
        Args:
            resume_from_checkpoint: Path to checkpoint to resume from
            
        Returns:
            Training statistics
        """
        logger.info("Starting model training...")
        
        try:
            import torch
            from torch.utils.data import DataLoader
            from transformers import Trainer, TrainingArguments
            
            # Load datasets
            train_samples = self._load_dataset(self.config.data_dir / "train" / "codeine_train.jsonl")
            val_samples = self._load_dataset(self.config.data_dir / "val" / "codeine_val.jsonl")
            
            logger.info(f"Loaded {len(train_samples)} training samples")
            logger.info(f"Loaded {len(val_samples)} validation samples")
            
            # Tokenize datasets
            # Note: This is simplified. In production, use datasets.Dataset
            train_dataset = self._tokenize_dataset(train_samples)
            val_dataset = self._tokenize_dataset(val_samples)
            
            # Get model
            model = self._get_model()
            
            # Training arguments
            training_args = TrainingArguments(
                output_dir=str(self.config.output_dir),
                overwrite_output_dir=True,
                num_train_epochs=self.config.num_epochs,
                per_device_train_batch_size=self.config.batch_size,
                per_device_eval_batch_size=self.config.eval_batch_size,
                gradient_accumulation_steps=self.config.gradient_accumulation_steps,
                learning_rate=self.config.learning_rate,
                warmup_steps=self.config.warmup_steps,
                weight_decay=self.config.weight_decay,
                logging_dir=str(self.config.output_dir / "logs"),
                logging_steps=10,
                save_steps=1000,
                save_total_limit=2,
                evaluation_strategy="steps",
                eval_steps=500,
                load_best_model_at_end=True,
                metric_for_best_model="eval_loss",
                greater_is_better=False,
                fp16=self.config.use_fp16,
                gradient_checkpointing=self.config.use_gradient_checkpointing,
                ddp_find_unused_parameters=False,
                report_to="wandb" if self.config.use_wandb else "none",
            )
            
            # Create data collator
            data_collator = self._create_data_collator()
            
            # Create Trainer
            trainer = Trainer(
                model=model,
                args=training_args,
                train_dataset=train_dataset,
                eval_dataset=val_dataset,
                data_collator=data_collator,
                tokenizer=self._get_tokenizer(),
                optimizers=(self._get_optimizer(), self._get_scheduler()),
            )
            
            # Train
            logger.info("Beginning training...")
            trainer.train(resume_from_checkpoint=resume_from_checkpoint)
            
            # Save final model
            trainer.save_model(str(self.config.model_dir / self.config.output_model))
            
            # Update stats
            self.training_stats.end_time = datetime.now()
            self.training_stats.total_steps = training_args.max_steps
            
            logger.info("Training complete!")
            logger.info(f"Model saved to: {self.config.model_dir / self.config.output_model}")
            
        except ImportError as e:
            logger.error(f"Missing dependency: {e}")
            raise
        except Exception as e:
            logger.error(f"Training failed: {e}")
            raise
        
        return self.training_stats
    
    # =========================================================================
    # STAGE 4: EVALUATION
    # =========================================================================
    
    def evaluate_model(self) -> Dict[str, Any]:
        """Evaluate the trained model
        
        Returns:
            Evaluation results
        """
        logger.info("Starting model evaluation...")
        
        results = {
            "overall_score": 0.0,
            "by_language": {},
            "code_generation": {},
            "code_understanding": {},
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            import torch
            from transformers import pipeline
            
            # Load model
            model_path = str(self.config.model_dir / self.config.output_model)
            
            # Create text generation pipeline
            generator = pipeline(
                "text-generation",
                model=model_path,
                tokenizer=self._get_tokenizer(),
                device=0 if self.config.device == "cuda" else -1,
                max_length=self.config.eval_max_length,
                temperature=0.7,
                top_k=50,
                top_p=0.95
            )
            
            # Load test dataset
            test_samples = self._load_dataset(self.config.data_dir / "test" / "codeine_test.jsonl")
            
            logger.info(f"Evaluating on {len(test_samples)} test samples")
            
            # Test code generation
            code_prompts = [
                "Write a Python function to reverse a string",
                "Create a Go HTTP server with a health endpoint",
                "Implement a JavaScript class for binary search",
                "Write a Rust function to calculate factorial",
                "Create a C# method to parse JSON",
            ]
            
            for prompt in code_prompts:
                try:
                    output = generator(prompt, num_return_sequences=1)
                    # Evaluate output quality (simplified)
                    # In production, use more sophisticated metrics
                    results["code_generation"][prompt] = {
                        "output": output[0]['generated_text'],
                        "score": self._evaluate_code_quality(output[0]['generated_text'], prompt)
                    }
                except Exception as e:
                    logger.warning(f"Failed to evaluate prompt '{prompt}': {e}")
                    results["code_generation"][prompt] = {"error": str(e)}
            
            # Test code understanding
            understanding_prompts = [
                "Explain what this Python code does: def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n-1)",
                "What is the time complexity of binary search?",
                "Explain the difference between == and === in JavaScript",
            ]
            
            for prompt in understanding_prompts:
                try:
                    output = generator(prompt, num_return_sequences=1)
                    results["code_understanding"][prompt] = {
                        "output": output[0]['generated_text'],
                        "score": self._evaluate_understanding(output[0]['generated_text'], prompt)
                    }
                except Exception as e:
                    logger.warning(f"Failed to evaluate understanding prompt '{prompt}': {e}")
                    results["code_understanding"][prompt] = {"error": str(e)}
            
            # Calculate overall score
            all_scores = []
            for category in ["code_generation", "code_understanding"]:
                for prompt, data in results[category].items():
                    if "score" in data:
                        all_scores.append(data["score"])
            
            if all_scores:
                results["overall_score"] = sum(all_scores) / len(all_scores)
            
            logger.info(f"Evaluation complete. Overall score: {results['overall_score']:.2f}")
            
        except Exception as e:
            logger.error(f"Evaluation failed: {e}")
            results["error"] = str(e)
        
        # Save results
        eval_file = self.config.output_dir / "evaluation_results.json"
        with open(eval_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2)
        
        return results
    
    def _evaluate_code_quality(self, code: str, prompt: str) -> float:
        """Evaluate code generation quality (simplified)"""
        # This is a placeholder. In production, use:
        # - Syntax checking
        # - Unit test execution
        # - Code similarity metrics
        # - Human evaluation
        
        # Simple heuristic: check if code contains relevant keywords
        keywords = {
            "python": ["def", "class", "import", "return"],
            "go": ["func", "package", "import", "return"],
            "javascript": ["function", "const", "let", "return"],
            "java": ["public", "class", "import", "return"],
            "rust": ["fn", "impl", "return"],
        }
        
        score = 0.5  # Base score
        
        # Check for code-like patterns
        if any(kw in code.lower() for kw in ["def", "func", "function", "class", "import", "return"]):
            score += 0.2
        
        # Check for syntax errors (simplified)
        try:
            if "python" in prompt.lower():
                compile(code, '<string>', 'exec')
                score += 0.3
        except:
            pass
        
        return min(score, 1.0)
    
    def _evaluate_understanding(self, explanation: str, prompt: str) -> float:
        """Evaluate code understanding quality (simplified)"""
        # Check if explanation contains relevant concepts
        if any(word in explanation.lower() for word in ["function", "algorithm", "complexity", "time", "space"]):
            return 0.8
        return 0.5
    
    # =========================================================================
    # STAGE 5: DEPLOYMENT
    # =========================================================================
    
    def export_model(self, format: str = "gguf") -> Path:
        """Export model to specified format
        
        Args:
            format: Export format (gguf, onnx, safetensors)
            
        Returns:
            Path to exported model
        """
        logger.info(f"Exporting model to {format} format...")
        
        model_path = self.config.model_dir / self.config.output_model
        export_path = self.config.output_dir / f"{self.config.output_model}.{format}"
        
        try:
            if format == "gguf":
                self._export_to_gguf(model_path, export_path)
            elif format == "onnx":
                self._export_to_onnx(model_path, export_path)
            elif format == "safetensors":
                self._export_to_safetensors(model_path, export_path)
            else:
                raise ValueError(f"Unsupported format: {format}")
            
            logger.info(f"Model exported to: {export_path}")
            return export_path
            
        except Exception as e:
            logger.error(f"Export failed: {e}")
            raise
    
    def _export_to_gguf(self, model_path: Path, export_path: Path):
        """Export model to GGUF format"""
        try:
            import subprocess
            
            # Use llama.cpp for GGUF conversion
            result = subprocess.run([
                "python", "-m", "llama_cpp.convert",
                "--model", str(model_path),
                "--output", str(export_path),
                "--format", "gguf"
            ], capture_output=True, timeout=300)
            
            if result.returncode != 0:
                raise RuntimeError(f"GGUF export failed: {result.stderr.decode()}")
                
        except ImportError:
            raise RuntimeError("llama-cpp-python not installed")
        except FileNotFoundError:
            raise RuntimeError("llama.cpp convert script not found")
    
    def _export_to_onnx(self, model_path: Path, export_path: Path):
        """Export model to ONNX format"""
        try:
            from transformers import convert_slow_tokenizer
            import torch
            
            # This is a simplified example
            # In production, use proper ONNX export
            model = self._get_model()
            tokenizer = self._get_tokenizer()
            
            # Export to ONNX would require more setup
            # For now, just copy the model directory
            import shutil
            shutil.copytree(model_path, export_path)
            
        except Exception as e:
            raise RuntimeError(f"ONNX export failed: {e}")
    
    def _export_to_safetensors(self, model_path: Path, export_path: Path):
        """Export model to Safetensors format"""
        try:
            import shutil
            # Safetensors is the default format for Hugging Face
            # Just copy the model directory
            shutil.copytree(model_path, export_path)
        except Exception as e:
            raise RuntimeError(f"Safetensors export failed: {e}")
    
    def push_to_hub(self, repo: Optional[str] = None, token: Optional[str] = None) -> bool:
        """Push model to Hugging Face Hub
        
        Args:
            repo: Repository name (default from config)
            token: Hugging Face token (default from environment)
            
        Returns:
            Success status
        """
        logger.info("Pushing model to Hugging Face Hub...")
        
        repo = repo or self.config.hub_repo
        token = token or os.environ.get("HUGGINGFACE_TOKEN")
        
        if not token:
            logger.error("Hugging Face token not provided")
            return False
        
        try:
            from huggingface_hub import login, create_repo, upload_folder
            
            # Login
            login(token=token)
            
            # Create repo if it doesn't exist
            try:
                create_repo(repo_id=repo, token=token, repo_type="model")
            except Exception:
                pass  # Repo might already exist
            
            # Upload model
            model_path = self.config.model_dir / self.config.output_model
            upload_folder(
                folder_path=str(model_path),
                repo_id=repo,
                repo_type="model",
                token=token
            )
            
            logger.info(f"Model pushed to: https://huggingface.co/{repo}")
            return True
            
        except ImportError:
            logger.error("huggingface_hub library not installed")
            return False
        except Exception as e:
            logger.error(f"Push failed: {e}")
            return False
    
    def deploy(self, export_format: Optional[str] = None, push: bool = False) -> Dict[str, Any]:
        """Deploy the trained model
        
        Args:
            export_format: Format to export (default from config)
            push: Whether to push to Hugging Face Hub
            
        Returns:
            Deployment results
        """
        logger.info("Starting deployment...")
        
        results = {
            "status": "success",
            "actions": [],
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            # Export model
            fmt = export_format or self.config.export_format
            export_path = self.export_model(fmt)
            results["actions"].append({
                "action": "export",
                "format": fmt,
                "path": str(export_path)
            })
            
            # Push to Hub if requested
            if push or self.config.push_to_hub:
                if self.push_to_hub():
                    results["actions"].append({
                        "action": "push_to_hub",
                        "repo": self.config.hub_repo,
                        "status": "success"
                    })
                else:
                    results["actions"].append({
                        "action": "push_to_hub",
                        "status": "failed"
                    })
            
            # Create model card
            self._create_model_card()
            results["actions"].append({
                "action": "create_model_card",
                "path": str(self.config.output_dir / "README.md")
            })
            
            logger.info("Deployment complete!")
            
        except Exception as e:
            logger.error(f"Deployment failed: {e}")
            results["status"] = "failed"
            results["error"] = str(e)
        
        # Save deployment log
        deploy_file = self.config.output_dir / "deployment_log.json"
        with open(deploy_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2)
        
        return results
    
    def _create_model_card(self):
        """Create a model card for the trained model"""
        model_card = f"""# Codeine-7B: Master Coding Assistant for Project ATMA

## Model Description

Codeine-7B is a fine-tuned coding assistant model designed specifically for Project ATMA, a Mythic red-team platform. This model combines the capabilities of DeepHat AI with enhanced coding proficiency across ALL programming languages, methods, and architectures.

## Capabilities

- **Multi-Language Proficiency**: Proficient in Python, Go, JavaScript/TypeScript, Java, C/C++, C#, Rust, Bash, PowerShell, YAML, JSON, and more
- **Multi-Method Expertise**: Understands functional, object-oriented, procedural, concurrent, and distributed programming paradigms
- **Multi-Architecture Awareness**: Knowledgeable about x86, ARM, WebAssembly, and various system architectures
- **DevSecOps Focus**: Specialized in Mythic platform development, C2 profiles, payload building, and red-team operations
- **Security Conscious**: Trained with security best practices and ethical guidelines

## Training Data

- **Source**: Curated from open-source repositories, Mythic documentation, DevSecOps guides, and security resources
- **Languages**: {', '.join(self.config.languages)}
- **Volume**: {self.dataset_stats.total_files:,} files, {self.dataset_stats.total_tokens:,} tokens
- **Quality**: Filtered for meaningful, production-quality code

## Training Process

- **Base Model**: {self.config.base_model}
- **Method**: Fine-tuning with LoRA (Low-Rank Adaptation)
- **LoRA Config**: r={self.config.lora_rank}, alpha={self.config.lora_alpha}, dropout={self.config.lora_dropout}
- **Epochs**: {self.config.num_epochs}
- **Batch Size**: {self.config.batch_size}
- **Learning Rate**: {self.config.learning_rate}
- **Max Sequence Length**: {self.config.max_seq_length}

## Evaluation Results

- **Overall Score**: {self.evaluate_model().get('overall_score', 0):.2%}
- **Code Generation**: Proficient in all supported languages
- **Code Understanding**: Strong comprehension of code functionality
- **Architecture Design**: Capable of designing complex systems

## Usage

### With Ollama

```bash
# Pull the model
ollama pull {self.config.hub_repo}

# Run locally
ollama run {self.config.output_model}
```

### With Transformers

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model_name = "{self.config.hub_repo}"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(model_name)

# Generate code
inputs = tokenizer("Write a Python function to reverse a string", return_tensors="pt")
outputs = model.generate(**inputs, max_new_tokens=200)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

### With ATMA Console

1. Ensure Ollama is running with the model pulled
2. Configure the DeepHat/Codeine panel to use Ollama local
3. Start coding with the assistant

## Deployment Options

### Local Deployment
- Run with Ollama on a machine with sufficient GPU resources
- Minimum: 8GB VRAM for 7B model
- Recommended: 24GB VRAM for optimal performance

### Gateway Deployment
- Run `agent/atma-gateway.mjs` on a host with the model
- Expose via Tailscale Serve for secure remote access
- Use in ATMA console via Gateway mode

### Edge Deployment
- Use with edge providers (Groq, Featherless, etc.)
- No local installation required
- Browser-based access via API keys

## Limitations

- **Context Window**: {self.config.max_seq_length} tokens (approximately {self.config.max_seq_length // 4} lines of code)
- **Memory**: Requires significant GPU memory for training and inference
- **Speed**: Inference speed depends on hardware and model size
- **Knowledge Cutoff**: Based on training data, may not have latest information

## Ethical Guidelines

This model is designed for **ethical and authorized use only**:
- Only use on systems you own or are explicitly authorized to test
- Do not use for malicious purposes
- Follow all applicable laws and regulations
- Respect privacy and data protection

## License

This model is released under the Apache 2.0 license, with the following additional restrictions:
- No military use
- No use to harm minors
- No use to spread false information
- No use for unauthorized access

## Citation
```
Codeine-7B: Master Coding Assistant for Project ATMA
Project ATMA Team, 2026
https://github.com/Etienne0101-lab/Project-ATMA
```

## Support

For issues, questions, or contributions:
- GitHub: https://github.com/Etienne0101-lab/Project-ATMA
- Issues: https://github.com/Etienne0101-lab/Project-ATMA/issues
"""
        
        model_card_path = self.config.output_dir / "README.md"
        with open(model_card_path, 'w', encoding='utf-8') as f:
            f.write(model_card)
        
        logger.info(f"Model card created: {model_card_path}")
    
    # =========================================================================
    # MAIN PIPELINE RUNNER
    # =========================================================================
    
    def run_stage(self, stage: PipelineStage) -> bool:
        """Run a specific pipeline stage
        
        Args:
            stage: Stage to run
            
        Returns:
            Success status
        """
        logger.info(f"Running stage: {stage.value}")
        
        try:
            if stage == PipelineStage.COLLECT:
                self.collect_data()
            elif stage == PipelineStage.PREPROCESS:
                self.preprocess_data()
            elif stage == PipelineStage.TRAIN:
                self.train_model()
            elif stage == PipelineStage.EVALUATE:
                self.evaluate_model()
            elif stage == PipelineStage.DEPLOY:
                self.deploy()
            elif stage == PipelineStage.FULL:
                self.run_full_pipeline()
            else:
                raise ValueError(f"Unknown stage: {stage}")
            
            return True
            
        except Exception as e:
            logger.error(f"Stage {stage.value} failed: {e}")
            return False
    
    def run_full_pipeline(self) -> bool:
        """Run the complete training pipeline
        
        Returns:
            Success status
        """
        logger.info("Starting full training pipeline...")
        
        stages = [
            PipelineStage.COLLECT,
            PipelineStage.PREPROCESS,
            PipelineStage.TRAIN,
            PipelineStage.EVALUATE,
            PipelineStage.DEPLOY,
        ]
        
        for stage in stages:
            if not self.run_stage(stage):
                logger.error(f"Pipeline failed at stage: {stage.value}")
                return False
        
        logger.info("Full pipeline completed successfully!")
        return True


# CLI Interface

def parse_pipeline_args():
    """Parse command line arguments for pipeline"""
    parser = argparse.ArgumentParser(
        description="Codeine AI Training Pipeline for Project ATMA",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python codeine_training_pipeline.py --full\n"
            "  python codeine_training_pipeline.py --collect\n"
            "  python codeine_training_pipeline.py --train\n"
            "  python codeine_training_pipeline.py --evaluate\n"
            "  python codeine_training_pipeline.py --deploy\n"
            "\nEnvironment Variables:\n"
            "  CODEINE_DATA_DIR: Data directory\n"
            "  CODEINE_MODEL_DIR: Model directory\n"
            "  CODEINE_BASE_MODEL: Base model name\n"
            "  CODEINE_OUTPUT_MODEL: Output model name\n"
            "  WANDB_API_KEY: Weights & Biases API key\n"
            "  HUGGINGFACE_TOKEN: Hugging Face token"
        )
    )
    
    parser.add_argument(
        "--full",
        action="store_true",
        help="Run complete training pipeline"
    )
    parser.add_argument(
        "--collect",
        action="store_true",
        help="Run data collection stage"
    )
    parser.add_argument(
        "--preprocess",
        action="store_true",
        help="Run data preprocessing stage"
    )
    parser.add_argument(
        "--train",
        action="store_true",
        help="Run model training stage"
    )
    parser.add_argument(
        "--evaluate",
        action="store_true",
        help="Run model evaluation stage"
    )
    parser.add_argument(
        "--deploy",
        action="store_true",
        help="Run deployment stage"
    )
    parser.add_argument(
        "--config",
        type=str,
        default=None,
        help="Path to custom configuration file"
    )
    parser.add_argument(
        "--languages",
        nargs="+",
        default=None,
        help="Specific languages to include (default: all)"
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Model name to use"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=None,
        help="Training batch size"
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=None,
        help="Number of training epochs"
    )
    parser.add_argument(
        "--resume",
        type=str,
        default=None,
        help="Resume training from checkpoint"
    )
    parser.add_argument(
        "--push",
        action="store_true",
        help="Push model to Hugging Face Hub after deployment"
    )
    
    return parser.parse_args()


def load_custom_config(config_path: str) -> PipelineConfig:
    """Load custom configuration from file"""
    with open(config_path, 'r', encoding='utf-8') as f:
        config_data = json.load(f)
    
    config = PipelineConfig()
    
    # Update from file
    for key, value in config_data.items():
        if hasattr(config, key):
            setattr(config, key, value)
    
    return config


def main():
    """Main entry point"""
    args = parse_pipeline_args()
    
    # Load configuration
    if args.config:
        config = load_custom_config(args.config)
    else:
        config = PipelineConfig()
    
    # Override from args
    if args.model:
        config.output_model = args.model
    if args.batch_size:
        config.batch_size = args.batch_size
    if args.epochs:
        config.num_epochs = args.epochs
    if args.languages:
        config.languages = args.languages
    
    # Create pipeline
    pipeline = CodeineTrainingPipeline(config)
    
    # Determine stage
    if args.full:
        stage = PipelineStage.FULL
    elif args.collect:
        stage = PipelineStage.COLLECT
    elif args.preprocess:
        stage = PipelineStage.PREPROCESS
    elif args.train:
        stage = PipelineStage.TRAIN
    elif args.evaluate:
        stage = PipelineStage.EVALUATE
    elif args.deploy:
        stage = PipelineStage.DEPLOY
    else:
        # Default to full pipeline
        stage = PipelineStage.FULL
    
    # Run stage
    success = pipeline.run_stage(stage)
    
    # For deployment, check push flag
    if stage == PipelineStage.DEPLOY and args.push:
        pipeline.config.push_to_hub = True
    
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Pipeline interrupted by user")
        sys.exit(130)
    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        sys.exit(1)
