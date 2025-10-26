# Testing Guide

This document provides comprehensive information about testing the MyZakat application.

## Overview

The MyZakat application includes comprehensive testing for both frontend and backend components:

- **Frontend**: React component tests using Vitest + React Testing Library
- **Backend**: FastAPI endpoint tests using pytest + httpx

## Frontend Testing

### Technology Stack
- **Vitest**: Fast unit test framework optimized for Vite
- **React Testing Library**: Simple and complete testing utilities for React components
- **jsdom**: Browser environment simulation
- **@testing-library/jest-dom**: Custom jest matchers for DOM testing

### Running Frontend Tests

```bash
cd frontend

# Run all tests
npm test

# Run tests once (CI mode)
npm run test:run

# Run with coverage report
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run specific test suites
npm run test:components  # Only component tests
npm run test:utils       # Only utility tests

# CI-friendly test run with JSON output
npm run test:ci

# Debug tests
npm run test:debug
```

### Frontend Test Structure

```
frontend/src/
├── test/
│   ├── setup.ts          # Test environment setup
│   └── utils.tsx         # Testing utilities and mocks
├── components/
│   └── __tests__/
│       └── Header.test.tsx
└── utils/
    └── __tests__/
        └── api.test.ts
```

### Writing Frontend Tests

#### Component Testing Example
```typescript
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '../../test/utils'
import MyComponent from '../MyComponent'

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />)
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('handles user interaction', () => {
    render(<MyComponent />)
    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(screen.getByText('Clicked!')).toBeInTheDocument()
  })
})
```

#### Utility Function Testing Example
```typescript
import { describe, it, expect, vi } from 'vitest'
import { myUtilityFunction } from '../myUtils'

describe('myUtilityFunction', () => {
  it('processes data correctly', () => {
    const input = { test: 'data' }
    const result = myUtilityFunction(input)
    expect(result).toEqual(expectedOutput)
  })
})
```

## Backend Testing

### Technology Stack
- **pytest**: Python testing framework
- **pytest-asyncio**: Support for async/await testing
- **httpx**: HTTP client for testing FastAPI endpoints
- **pytest-cov**: Coverage reporting
- **pytest-mock**: Advanced mocking capabilities
- **factory-boy**: Test data generation

### Running Backend Tests

```bash
cd backend

# Run all tests
python -m pytest

# Run with coverage
python -m pytest --cov=. --cov-report=html

# Run specific test types
python -m pytest -m unit          # Unit tests only
python -m pytest -m integration   # Integration tests only
python -m pytest -m api          # API tests only
python -m pytest -m auth         # Auth tests only

# Run specific test file
python -m pytest tests/test_auth.py

# Verbose output
python -m pytest -v -s

# Using the test runner script
python test_runner.py --coverage
python test_runner.py --unit --verbose
python test_runner.py --integration
python test_runner.py --fast
python test_runner.py --file test_auth.py
```

### Backend Test Structure

```
backend/
├── conftest.py           # Test configuration and fixtures
├── pytest.ini           # Pytest settings
├── test_runner.py        # Custom test runner script
└── tests/
    ├── __init__.py
    ├── test_main.py       # Main app tests
    ├── test_auth.py       # Authentication tests
    └── test_donations.py  # Donations API tests
```

### Test Markers

Backend tests use pytest markers for categorization:

- `@pytest.mark.unit` - Unit tests (fast, isolated)
- `@pytest.mark.integration` - Integration tests (slower, with database)
- `@pytest.mark.api` - API endpoint tests
- `@pytest.mark.auth` - Authentication-related tests
- `@pytest.mark.slow` - Slow tests (can be skipped for fast runs)

### Writing Backend Tests

#### API Endpoint Testing Example
```python
import pytest
from fastapi.testclient import TestClient

@pytest.mark.api
def test_create_donation(client: TestClient, db_session):
    donation_data = {
        "name": "John Doe",
        "email": "john@example.com",
        "amount": 100.0,
        "frequency": "one-time"
    }
    
    response = client.post("/api/donations/", json=donation_data)
    
    assert response.status_code == 200
    assert response.json()["name"] == "John Doe"
```

#### Unit Testing Example
```python
import pytest
from auth_utils import get_password_hash, verify_password

@pytest.mark.unit
def test_password_hashing():
    password = "testpassword"
    hashed = get_password_hash(password)
    
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("wrong", hashed) is False
```

## Test Configuration

### Frontend Configuration (vitest.config.ts)
- JSdom environment for browser simulation
- Coverage thresholds set to 70%
- Custom setup files for test utilities
- Multiple output formats (JSON, HTML, terminal)

### Backend Configuration (pytest.ini)
- Test discovery patterns
- Custom markers definition
- Warning filters
- Output formatting options

## Coverage Reports

### Frontend Coverage
Coverage reports are generated in:
- `frontend/coverage/` - HTML coverage report
- Terminal output during test runs

### Backend Coverage
Coverage reports are generated in:
- `backend/htmlcov/` - HTML coverage report
- Terminal output during test runs

## Continuous Integration

### Frontend CI Command
```bash
npm run test:ci
```

### Backend CI Command
```bash
python test_runner.py --coverage --fast
```

## Test Data and Fixtures

### Frontend Mocks
- Axios HTTP client mocked globally
- React Router mocked for navigation testing
- Authentication store mocked
- Browser APIs mocked (matchMedia, IntersectionObserver)

### Backend Fixtures
- In-memory SQLite database for each test
- Pre-configured admin user
- Authentication headers for protected endpoints
- Sample data fixtures for testing
- Mocked external services (Stripe)

## Best Practices

### Frontend Testing
1. Test user interactions, not implementation details
2. Use semantic queries (getByRole, getByLabelText)
3. Mock external dependencies
4. Test error states and loading states
5. Keep tests focused and independent

### Backend Testing
1. Use appropriate test markers
2. Test both success and error scenarios
3. Verify database state changes
4. Mock external services
5. Test authentication and authorization
6. Use fixtures for consistent test data

### General Guidelines
1. Write descriptive test names
2. Follow AAA pattern (Arrange, Act, Assert)
3. Keep tests fast and independent
4. Maintain good test coverage (aim for 70%+)
5. Test edge cases and error conditions

## Troubleshooting

### Common Issues

#### Frontend
- **Tests not finding components**: Check import paths and component exports
- **DOM queries failing**: Use `screen.debug()` to see rendered HTML
- **Async issues**: Use `await` with `findBy*` queries
- **Router issues**: Ensure components are wrapped with router context

#### Backend
- **Database issues**: Check that fixtures are properly set up
- **Authentication failures**: Verify test admin user creation
- **Async test issues**: Use `@pytest.mark.asyncio` for async tests
- **Import errors**: Check Python path and module structure

### Getting Help
- Review test logs for detailed error messages
- Use debugging tools (`test:debug` for frontend, `pytest -s` for backend)
- Check fixture setup in `conftest.py`
- Verify mock configurations

## Performance

### Frontend Tests
- Average runtime: ~5-10 seconds
- Tests run in parallel by default
- Use `--no-coverage` for faster runs during development

### Backend Tests
- Unit tests: ~2-5 seconds
- Integration tests: ~10-20 seconds
- Use `--fast` flag to skip slow tests during development

