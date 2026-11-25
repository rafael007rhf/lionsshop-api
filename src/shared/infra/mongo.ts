import { MongoClient, MongoServerError, ObjectId } from 'mongodb';
import { BusinessError } from '../business-error';

export const LOCAL_MONGO_URL = 'mongodb://127.0.0.1:27017/?replicaSet=rs0';

export function openMongo() {
  return MongoClient.connect(process.env.MONGO_URL || LOCAL_MONGO_URL);
}

export function mongoId(value: unknown): ObjectId {
  if (typeof value !== 'string' || !ObjectId.isValid(value)) {
    throw new BusinessError('invalid', 'Identificador inválido');
  }
  return new ObjectId(value);
}

export function isDuplicateKey(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}
