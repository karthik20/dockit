export class DomainError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, public readonly field?: string, public readonly value?: unknown) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class BuildError extends DomainError {
  constructor(message: string, public readonly entryId: string) {
    super(`Build failed for entry ${entryId}: ${message}`, 'BUILD_ERROR');
    this.name = 'BuildError';
  }
}
