export class IllegalSubscriptionTransition extends Error {
  constructor(from: string, to: string) {
    super(`Illegal subscription transition: ${from} -> ${to}`);
    this.name = 'IllegalSubscriptionTransition';
  }
}
