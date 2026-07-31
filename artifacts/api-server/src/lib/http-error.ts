export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const notFound = (resource: string) => new HttpError(404, `${resource} not found`);
export const unauthorized = (message = "Unauthorized") => new HttpError(401, message);
export const badRequest = (message: string) => new HttpError(400, message);
