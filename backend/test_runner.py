#!/usr/bin/env python3
"""
Test runner script for MyZakat backend tests
Provides different test execution modes for development and CI
"""

import sys
import subprocess
import argparse
from pathlib import Path


def run_command(command, description=""):
    """Run a command and return its exit code"""
    if description:
        print(f"\n{'='*60}")
        print(f"[TESTS] {description}")
        print(f"{'='*60}")
    
    print(f"Running: {' '.join(command)}")
    result = subprocess.run(command, cwd=Path(__file__).parent)
    return result.returncode


def main():
    parser = argparse.ArgumentParser(description="Run MyZakat backend tests")
    parser.add_argument("--unit", action="store_true", help="Run only unit tests")
    parser.add_argument("--integration", action="store_true", help="Run only integration tests")
    parser.add_argument("--coverage", action="store_true", help="Run tests with coverage report")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--fast", action="store_true", help="Skip slow tests")
    parser.add_argument("--file", help="Run specific test file")
    
    args = parser.parse_args()
    
    # Base pytest command
    cmd = ["python", "-m", "pytest"]
    
    # Add verbosity
    if args.verbose:
        cmd.extend(["-v", "-s"])
    else:
        cmd.append("-v")
    
    # Add coverage if requested
    if args.coverage:
        cmd.extend([
            "--cov=.",
            "--cov-report=html:htmlcov",
            "--cov-report=term-missing"
        ])
    
    # Filter by test type
    if args.unit:
        cmd.extend(["-m", "unit"])
    elif args.integration:
        cmd.extend(["-m", "integration"])
    elif args.fast:
        cmd.extend(["-m", "not slow"])
    
    # Run specific file
    if args.file:
        cmd.append(f"tests/{args.file}")
    else:
        cmd.append("tests/")
    
    # Run the tests
    exit_code = run_command(cmd, "Running Backend Tests")
    
    if args.coverage and exit_code == 0:
        print("\n[INFO] Coverage report generated in htmlcov/")
        print("[INFO] Open htmlcov/index.html in your browser to view detailed coverage")
    
    return exit_code


if __name__ == "__main__":
    sys.exit(main())

