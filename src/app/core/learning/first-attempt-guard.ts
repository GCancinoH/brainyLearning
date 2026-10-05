export class FirstAttemptGuard {
  private readonly seen = new WeakSet<object>();

  /** true solo la primera vez que ve esta pregunta */
  isFirst(question: object): boolean {
    if (this.seen.has(question)) return false;
    this.seen.add(question);
    return true;
  }
}
