# Contributing to Stealth-IO

Thank you for your interest in contributing to Stealth-IO! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Style Guide](#style-guide)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. Be kind, constructive, and professional in all interactions.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Create a new branch for your changes
4. Make your changes
5. Test your changes
6. Submit a pull request

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn

### Installation

```sh
git clone https://github.com/your-username/stealth-io.git
cd stealth-io
npm install
```

### Running Tests

```sh
npm test
npm run test:coverage
```

## Project Structure

```
stealth-io/
├── src/
│   ├── core/           # Constants, symbols, and error classes
│   │   ├── constants.js
│   │   ├── symbols.js
│   │   ├── errors.js
│   │   └── index.js
│   ├── utils/          # Utility functions
│   │   ├── headers.js  # Headers class implementation
│   │   ├── query.js    # Query string handling
│   │   ├── url.js      # URL utilities
│   │   ├── streams.js  # Stream utilities
│   │   └── index.js
│   ├── types/          # Type definitions
│   │   ├── request.js  # Request configuration
│   │   ├── response.js # Response class
│   │   └── index.js
│   ├── http/           # HTTP handling
│   │   ├── transport.js      # Transport layer
│   │   ├── request-builder.js
│   │   ├── response-handler.js
│   │   ├── abort.js    # Abort controller
│   │   ├── retry.js    # Retry logic
│   │   └── index.js
│   ├── middleware/     # Middleware system
│   │   ├── pipeline.js # Middleware pipeline
│   │   ├── built-in.js # Built-in middleware
│   │   └── index.js
│   ├── client/         # Main client
│   │   ├── StealthClient.js
│   │   └── index.js
│   └── index.js        # Main entry point
├── test/               # Jest tests
├── package.json
├── jest.config.js
├── README.md
└── CONTRIBUTING.md
```

## Making Changes

### Branch Naming

Use descriptive branch names:

- `feature/add-proxy-support`
- `fix/timeout-handling`
- `docs/update-readme`
- `refactor/middleware-pipeline`

### Commit Messages

Write clear, concise commit messages:

```
type(scope): short description

Longer description if needed.

Fixes #123
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Important Guidelines

1. **Zero Dependencies**: Do not add any external npm dependencies. This library is built entirely from Node.js core modules.

2. **ES Modules**: Use ES module syntax (`import`/`export`), not CommonJS (`require`/`module.exports`).

3. **No Comments in Code**: Keep the code clean and self-documenting. Avoid inline comments unless absolutely necessary.

4. **Error Handling**: Use the custom error classes from `src/core/errors.js`.

5. **Symbols**: Use symbols from `src/core/symbols.js` for internal properties.

## Testing

### Running Tests

```sh
npm test
```

### Running Specific Tests

```sh
npm test -- --testPathPattern=headers
```

### Writing Tests

- Place test files in the `test/` directory
- Name test files with `.test.js` suffix
- Follow existing test patterns
- Test edge cases and error conditions

Example test structure:

```js
import { someFunction } from '../src/module.js';

describe('someFunction', () => {
  test('handles normal input', () => {
    const result = someFunction('input');
    expect(result).toBe('expected');
  });

  test('handles edge case', () => {
    const result = someFunction(null);
    expect(result).toBeNull();
  });

  test('throws on invalid input', () => {
    expect(() => someFunction(undefined)).toThrow();
  });
});
```

## Submitting Changes

### Pull Request Process

1. Update tests for any new functionality
2. Ensure all tests pass
3. Update documentation if needed
4. Submit pull request with clear description

### Pull Request Template

```markdown
## Description

Brief description of changes.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

Describe how you tested your changes.

## Checklist

- [ ] Tests pass locally
- [ ] No external dependencies added
- [ ] Code follows project style
- [ ] Documentation updated if needed
```

## Style Guide

### Code Style

- Use 2-space indentation
- Use single quotes for strings
- No semicolons (optional, follow existing patterns)
- Use camelCase for variables and functions
- Use PascalCase for classes
- Use UPPER_SNAKE_CASE for constants

### File Organization

- One class per file for major classes
- Group related utilities together
- Export everything from index.js files

### Naming Conventions

```js
const MAX_RETRIES = 5;

function calculateDelay(attempt) {
  return attempt * 1000;
}

class StealthClient {
  constructor(options) {
    this.options = options;
  }
}
```

## Reporting Issues

### Bug Reports

Include:
- Node.js version
- Operating system
- Steps to reproduce
- Expected behavior
- Actual behavior
- Code sample if applicable

### Feature Requests

Include:
- Use case description
- Proposed API design
- Example usage

## Questions?

Open an issue with the `question` label or reach out to the maintainers.

---

Thank you for contributing to Stealth-IO!
