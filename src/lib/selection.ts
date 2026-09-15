export class Selection {
  private readonly ids = new Set<string>();

  add(id: string): void {
    this.ids.add(id);
  }

  remove(id: string): void {
    this.ids.delete(id);
  }

  toggle(id: string): boolean {
    if (this.ids.has(id)) {
      this.ids.delete(id);
      return false;
    }
    this.ids.add(id);
    return true;
  }

  clear(): void {
    this.ids.clear();
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  get size(): number {
    return this.ids.size;
  }

  list(): string[] {
    return [...this.ids];
  }
}
