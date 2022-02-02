export default class LoggersHandler {
  public constructor(private readonly logger: Record<any, any>) {}

  public info(...payload: string[]): void {
    if (Object.prototype.hasOwnProperty.call(this.logger, 'info') && this.logger.info instanceof Function) {
      (this.logger.info as (...args: string[]) => void)(...payload);
    } else if (Object.prototype.hasOwnProperty.call(this.logger, 'log') && this.logger.log instanceof Function) {
      (this.logger.log as (...args: string[]) => void)(...payload);
    }
  }

  public error(...payload: string[]): void {
    if (Object.prototype.hasOwnProperty.call(this.logger, 'error') && this.logger.info instanceof Function) {
      (this.logger.error as (...args: string[]) => void)(...payload);
    } else if (Object.prototype.hasOwnProperty.call(this.logger, 'log') && this.logger.log instanceof Function) {
      (this.logger.log as (...args: string[]) => void)(...payload);
    }
  }
}
