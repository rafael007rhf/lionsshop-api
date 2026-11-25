import { BusinessError } from '../../../shared/business-error';

export interface CustomerData {
  name: string;
  email: string;
  vip: boolean;
}

export class Customer {
  constructor(readonly id: string, readonly data: Readonly<CustomerData>) {}

  static forRegistration(name: unknown, email: unknown, vip: unknown): CustomerData {
    if (typeof name !== 'string' || !name.trim() || !email) {
      throw new BusinessError('invalid', 'nome e email são obrigatórios', 'erro');
    }
    return { name, email: this.normalizeEmail(email, false), vip: vip == true };
  }

  static contactChanges(name: unknown, email: unknown): Partial<Pick<CustomerData, 'name' | 'email'>> {
    const update: Partial<Pick<CustomerData, 'name' | 'email'>> = {};
    if (name) {
      if (typeof name !== 'string' || !name.trim()) {
        throw new BusinessError('invalid', 'Nome inválido');
      }
      update.name = name;
    }
    if (email) update.email = this.normalizeEmail(email, true);
    return update;
  }

  private static normalizeEmail(email: unknown, updating: boolean) {
    if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw updating
        ? new BusinessError('invalid', 'email invalido', 'erro')
        : new BusinessError('invalid', 'E-mail inválido');
    }
    return email.toLowerCase();
  }
}
