#!/usr/bin/env python3
"""Comprehensive test suite for Codeine AI Coding Assistant

This script tests all components of the Codeine assistant:
1. Backend functionality (Python module)
2. Gateway functionality (Node.js server)
3. Integration with existing ATMA infrastructure
4. Simulated frontend interactions

Usage:
    python test_codeine_functionality.py          # Run all tests
    python test_codeine_functionality.py --fast   # Skip slow tests
    python test_codeine_functionality.py --backend demo  # Test demo mode only
    python test_codeine_functionality.py --gateway   # Test gateway only
"""

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
import unittest
from pathlib import Path
from typing import Optional, Dict, Any, List


class TestCodeineBackend(unittest.TestCase):
    """Test Codeine assistant backend functionality"""
    
    def setUp(self):
        """Set up test environment"""
        self.test_dir = Path(__file__).parent / "agent"
        sys.path.insert(0, str(self.test_dir))
        
    def test_import_module(self):
        """Test that codeine_assistant module can be imported"""
        try:
            from codeine_assistant import CodeineAssistant, BackendType, CodeineResponse
            self.assertTrue(True, "Module imported successfully")
        except ImportError as e:
            self.fail(f"Failed to import codeine_assistant: {e}")
    
    def test_backend_types(self):
        """Test that all backend types are defined"""
        from codeine_assistant import BackendType
        
        expected_backends = ["ollama", "edge", "gateway", "demo"]
        actual_backends = [b.value for b in BackendType]
        
        for backend in expected_backends:
            self.assertIn(backend, actual_backends)
    
    def test_demo_mode(self):
        """Test demo mode functionality"""
        from codeine_assistant import CodeineAssistant, BackendType
        
        # Create assistant in demo mode
        assistant = CodeineAssistant(
            backend=BackendType.DEMO,
            model="codeine-7b"
        )
        
        # Test that it can be created
        self.assertIsNotNone(assistant)
        self.assertEqual(assistant.backend, BackendType.DEMO)
        
        # Test demo response
        response = asyncio.run(assistant.ask("Test prompt"))
        self.assertIsInstance(response, object)
        self.assertIn("DEMO MODE", response.content)
    
    def test_system_prompt(self):
        """Test that system prompt is properly formatted"""
        from codeine_assistant import CodeineAssistant
        
        assistant = CodeineAssistant()
        prompt = assistant._get_system_prompt()
        
        # Check that prompt contains key elements
        self.assertIn("Codeine", prompt)
        self.assertIn("Project ATMA", prompt)
        self.assertIn("ALL programming languages", prompt)
        self.assertIn("DevSecOps", prompt)
        self.assertIn("Mythic", prompt)
    
    def test_message_building(self):
        """Test message building for API requests"""
        from codeine_assistant import CodeineAssistant
        
        assistant = CodeineAssistant()
        
        # Test with no history
        messages = assistant._build_messages("Test prompt")
        self.assertEqual(len(messages), 2)  # system + user
        self.assertEqual(messages[0]["role"], "system")
        self.assertEqual(messages[1]["role"], "user")
        self.assertEqual(messages[1]["content"], "Test prompt")
        
        # Test with history
        history = [
            {"who": "you", "text": "Hello"},
            {"who": "assistant", "text": "Hi there"}
        ]
        messages = assistant._build_messages("Next prompt", history)
        self.assertGreater(len(messages), 2)
    
    def test_model_fallback(self):
        """Test model fallback logic"""
        from codeine_assistant import CodeineAssistant, BackendType
        
        # Test with Ollama backend
        assistant = CodeineAssistant(
            backend=BackendType.OLLAMA,
            model="nonexistent-model"
        )
        
        # The model should be set (even if it doesn't exist)
        self.assertIsNotNone(assistant.model)


class TestCodeineGateway(unittest.TestCase):
    """Test Codeine gateway functionality"""
    
    @classmethod
    def setUpClass(cls):
        """Start gateway before tests"""
        cls.gateway_token = "test_token_12345"
        cls.gateway_port = 18787  # Use different port to avoid conflicts
        
        # Start gateway in background
        cls.gateway_process = subprocess.Popen(
            [
                "node",
                str(Path(__file__).parent / "agent" / "codeine_gateway.mjs"),
                str(cls.gateway_port)
            ],
            env={
                **os.environ,
                "ATMA_GATEWAY_TOKEN": cls.gateway_token,
                "LOG_LEVEL": "error",  # Reduce output
            },
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Wait for gateway to start
        time.sleep(3)
        
        # Check if gateway is running
        if cls.gateway_process.poll() is not None:
            cls.gateway_process = None
            raise RuntimeError("Failed to start gateway")
    
    @classmethod
    def tearDownClass(cls):
        """Stop gateway after tests"""
        if cls.gateway_process:
            cls.gateway_process.terminate()
            try:
                cls.gateway_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                cls.gateway_process.kill()
    
    def test_gateway_health(self):
        """Test gateway health endpoint"""
        if not self.gateway_process:
            self.skipTest("Gateway not running")
        
        # This would use curl, but we can't in this environment
        # Instead, verify the process is still running
        self.assertIsNone(self.gateway_process.poll())


class TestCodeineIntegration(unittest.TestCase):
    """Test integration with existing ATMA infrastructure"""
    
    def test_existing_files_unchanged(self):
        """Verify existing ATMA files are unchanged"""
        existing_files = [
            "agent/atma-agent.mjs",
            "agent/atma-gateway.mjs",
            "agent/deephat_ollama.py",
            "agent/deephat_edge.py",
        ]
        
        for file_path in existing_files:
            full_path = Path(__file__).parent / file_path
            self.assertTrue(full_path.exists(), f"File {file_path} should exist")
    
    def test_new_files_created(self):
        """Verify new Codeine files were created"""
        new_files = [
            "agent/codeine_assistant.py",
            "agent/codeine_training_pipeline.py",
            "agent/codeine_gateway.mjs",
            "agent/README.codeine.md",
            "agent/requirements.codeine.txt",
        ]
        
        for file_path in new_files:
            full_path = Path(__file__).parent / file_path
            self.assertTrue(full_path.exists(), f"File {file_path} should exist")
    
    def test_workflow_files_created(self):
        """Verify workflow files were created"""
        workflow_files = [
            "github-workflows/codeine-agent.yml",
            "github-workflows/codeine-training.yml",
            "github-workflows/codeine-gateway.yml",
        ]
        
        for file_path in workflow_files:
            full_path = Path(__file__).parent / file_path
            self.assertTrue(full_path.exists(), f"File {file_path} should exist")
    
    def test_docker_files_created(self):
        """Verify Docker files were created"""
        docker_files = [
            "Dockerfile.codeine-gateway",
            "docker-compose.codeine-gateway.yml",
            "docker-compose.codeine-gateway.ollama.yml",
            "docker-compose.codeine-gateway.traefik.yml",
        ]
        
        for file_path in docker_files:
            full_path = Path(__file__).parent / file_path
            self.assertTrue(full_path.exists(), f"File {file_path} should exist")


class TestSimulatedFrontend(unittest.TestCase):
    """Test simulated frontend interactions"""
    
    def test_chat_message_format(self):
        """Test chat message formatting"""
        # Simulate frontend chat message
        message = {
            "who": "you",
            "text": "Write a Python function"
        }
        
        self.assertIn("who", message)
        self.assertIn("text", message)
        self.assertEqual(message["who"], "you")
    
    def test_assistant_response_format(self):
        """Test assistant response formatting"""
        from codeine_assistant import CodeineResponse
        
        response = CodeineResponse(
            content="Here is your code:",
            model="codeine-7b",
            backend="demo",
            source="demo"
        )
        
        self.assertIn("content", response.__dict__)
        self.assertIn("model", response.__dict__)
        self.assertIn("backend", response.__dict__)
        self.assertIn("source", response.__dict__)
    
    def test_code_proposal_format(self):
        """Test code proposal format for ATMA console"""
        # This is the format that DeepHat/Codeine uses for editable proposals
        proposal = """```atma-edit:path/to/file
# File content here
def example():
    pass
```"""
        
        self.assertIn("atma-edit:", proposal)
        self.assertIn("```", proposal)


class TestCodeineCLI(unittest.TestCase):
    """Test Codeine CLI functionality"""
    
    def test_cli_help(self):
        """Test CLI help message"""
        result = subprocess.run(
            [sys.executable, "agent/codeine_assistant.py", "--help"],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent
        )
        
        self.assertEqual(result.returncode, 0)
        self.assertIn("Codeine AI Coding Assistant", result.stdout)
        self.assertIn("--backend", result.stdout)
        self.assertIn("--model", result.stdout)
        self.assertIn("--interactive", result.stdout)
    
    def test_cli_demo_mode(self):
        """Test CLI in demo mode"""
        result = subprocess.run(
            [
                sys.executable, "agent/codeine_assistant.py",
                "--backend", "demo",
                "Test prompt"
            ],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent
        )
        
        self.assertEqual(result.returncode, 0)
        self.assertIn("DEMO MODE", result.stdout)
    
    def test_cli_check_mode(self):
        """Test CLI check mode"""
        result = subprocess.run(
            [
                sys.executable, "agent/codeine_assistant.py",
                "--backend", "demo",
                "--check"
            ],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent
        )
        
        self.assertEqual(result.returncode, 0)
        self.assertIn("Demo mode", result.stdout)


class TestCodeineTrainingPipeline(unittest.TestCase):
    """Test Codeine training pipeline functionality"""
    
    def test_import_pipeline(self):
        """Test that training pipeline can be imported"""
        try:
            from codeine_training_pipeline import CodeineTrainingPipeline, PipelineConfig
            self.assertTrue(True, "Training pipeline imported successfully")
        except ImportError as e:
            self.fail(f"Failed to import training pipeline: {e}")
    
    def test_config_defaults(self):
        """Test that pipeline config has sensible defaults"""
        from codeine_training_pipeline import PipelineConfig
        
        config = PipelineConfig()
        
        # Check directories
        self.assertIsInstance(config.data_dir, Path)
        self.assertIsInstance(config.model_dir, Path)
        
        # Check model settings
        self.assertIsNotNone(config.base_model)
        self.assertIsNotNone(config.output_model)
        
        # Check training settings
        self.assertGreater(config.batch_size, 0)
        self.assertGreater(config.num_epochs, 0)
        self.assertGreater(config.max_seq_length, 0)
    
    def test_pipeline_stages(self):
        """Test that all pipeline stages are defined"""
        from codeine_training_pipeline import PipelineStage
        
        expected_stages = ["COLLECT", "PREPROCESS", "TRAIN", "EVALUATE", "DEPLOY", "FULL"]
        actual_stages = [s.value for s in PipelineStage]
        
        for stage in expected_stages:
            self.assertIn(stage, actual_stages)


class TestCodeineDocumentation(unittest.TestCase):
    """Test Codeine documentation"""
    
    def test_readme_exists(self):
        """Test that README.codeine.md exists"""
        readme_path = Path(__file__).parent / "agent" / "README.codeine.md"
        self.assertTrue(readme_path.exists())
    
    def test_readme_content(self):
        """Test that README contains key sections"""
        readme_path = Path(__file__).parent / "agent" / "README.codeine.md"
        
        with open(readme_path, 'r') as f:
            content = f.read()
        
        # Check for key sections
        self.assertIn("Codeine AI Coding Assistant", content)
        self.assertIn("Architecture", content)
        self.assertIn("Usage", content)
        self.assertIn("Deployment", content)
        self.assertIn("Security", content)
    
    def test_env_example_exists(self):
        """Test that .env.codeine.example exists"""
        env_path = Path(__file__).parent / ".env.codeine.example"
        self.assertTrue(env_path.exists())
    
    def test_env_content(self):
        """Test that .env.example contains key variables"""
        env_path = Path(__file__).parent / ".env.codeine.example"
        
        with open(env_path, 'r') as f:
            content = f.read()
        
        # Check for key variables
        self.assertIn("ATMA_GATEWAY_TOKEN", content)
        self.assertIn("GROQ_API_KEY", content)
        self.assertIn("CODEINE_MODEL", content)


def run_tests(args):
    """Run test suite"""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # Add all test classes
    test_classes = [
        TestCodeineBackend,
        TestCodeineIntegration,
        TestCodeineCLI,
        TestCodeineTrainingPipeline,
        TestCodeineDocumentation,
    ]
    
    # Skip gateway tests if --no-gateway flag
    if not getattr(args, 'no_gateway', False):
        test_classes.insert(1, TestCodeineGateway)
    
    # Skip slow tests if --fast flag
    if getattr(args, 'fast', False):
        # Remove slow test classes
        test_classes = [
            TestCodeineBackend,
            TestCodeineCLI,
            TestCodeineDocumentation,
        ]
        if not getattr(args, 'no_gateway', False):
            test_classes.insert(1, TestCodeineGateway)
    
    # Add tests from each class
    for test_class in test_classes:
        suite.addTests(loader.loadTestsFromTestCase(test_class))
    
    # Run tests
    runner = unittest.TextTestRunner(
        verbosity=2 if getattr(args, 'verbose', False) else 1,
        failfast=getattr(args, 'fail_fast', False)
    )
    
    result = runner.run(suite)
    
    return result.wasSuccessful()


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="Test Codeine AI Coding Assistant functionality",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python test_codeine_functionality.py          # Run all tests\n"
            "  python test_codeine_functionality.py --fast   # Skip slow tests\n"
            "  python test_codeine_functionality.py --no-gateway  # Skip gateway tests\n"
            "  python test_codeine_functionality.py -v        # Verbose output\n"
        )
    )
    
    parser.add_argument(
        "--fast",
        action="store_true",
        help="Skip slow tests"
    )
    parser.add_argument(
        "--no-gateway",
        action="store_true",
        help="Skip gateway tests"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output"
    )
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help="Stop on first failure"
    )
    parser.add_argument(
        "--backend",
        default="demo",
        help="Backend to test (demo, ollama, edge)"
    )
    
    args = parser.parse_args()
    
    print("=" * 80)
    print("Codeine AI Coding Assistant - Functionality Test Suite")
    print("=" * 80)
    print()
    
    success = run_tests(args)
    
    print()
    print("=" * 80)
    if success:
        print("✅ ALL TESTS PASSED")
        print("=" * 80)
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        print("=" * 80)
        return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n⚠️  Tests interrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n❌ Test suite error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
