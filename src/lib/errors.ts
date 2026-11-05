/** Errors that map to a clean HTTP response in lib/api.ts. Safe to import anywhere. */
export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors?: FieldErrors;

  constructor(message: string, status = 400, code = "BAD_REQUEST", errors?: FieldErrors) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed.", errors?: FieldErrors) {
    super(message, 400, "VALIDATION_ERROR", errors);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, errors?: FieldErrors) {
    super(message, 400, "BAD_REQUEST", errors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Not authenticated.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Resource", id?: string) {
    super(id ? `${entity} ${id} was not found.` : `${entity} was not found.`, 404, "NOT_FOUND");
  }
}

/** Business-rule conflicts: invalid status move, schedule overlap, duplicate email… */
export class ConflictError extends AppError {
  constructor(message: string, errors?: FieldErrors) {
    super(message, 409, "CONFLICT", errors);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests. Please try again shortly.") {
    super(message, 429, "RATE_LIMITED");
  }
}
