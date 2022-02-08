export class LoggersHandler {
  public constructor(private readonly logger: Record<string, unknown>) {}

  public info(...payload: string[]): void {
    if (this.logger.info instanceof Function) {
      (this.logger.info as (...args: string[]) => void)(...payload);
    } else if (this.logger.log instanceof Function) {
      (this.logger.log as (...args: string[]) => void)(...payload);
    }
  }

  public error(...payload: string[]): void {
    if (this.logger.info instanceof Function) {
      (this.logger.error as (...args: string[]) => void)(...payload);
    } else if (this.logger.log instanceof Function) {
      (this.logger.log as (...args: string[]) => void)(...payload);
    }
  }
}
