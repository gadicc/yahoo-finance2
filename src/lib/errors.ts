import type { ValidationError } from "./validate/index.ts";

// Yahoo's servers returned an HTTP 400 for this request.
export class BadRequestError extends Error {
  override name = "BadRequestError";
}

// Yahoo's servers returned a 'not-ok' status for this request.
// https://developer.mozilla.org/en-US/docs/Web/API/Response/ok
export class HTTPError extends Error {
  override name = "HTTPError";
}

// A YahooFinance method was called with invalid options.
export class InvalidOptionsError extends Error {
  override name = "InvalidOptionsError";
}

// An internal method yahooFinanceFetch() was called without this._env set.
export class NoEnvironmentError extends Error {
  override name = "NoEnvironmentError";
}

export class FailedYahooValidationError extends Error {
  override name = "FailedYahooValidationError";
  // biome-ignore lint/suspicious/noExplicitAny: Validation failures preserve the original unvalidated result in the public error contract.
  result: any;
  errors?: null | ValidationError[];

  constructor(
    message: string,
    // biome-ignore lint/suspicious/noExplicitAny: Validation failures preserve the original unvalidated result in the public error contract.
    { result, errors }: { result: any; errors?: null | ValidationError[] },
  ) {
    super(message);
    this.result = result;
    this.errors = errors;
  }
}

// Index necessary to allow things like: const ErrorClass = errors[errorName];
type ErrorsIndex = {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic error-name lookup retains the existing constructor dispatch contract.
  [key: string]: any;
};

const errors: ErrorsIndex = {
  BadRequestError,
  HTTPError,
  InvalidOptionsError,
  NoEnvironmentError,
  FailedYahooValidationError,
};

export default errors;
