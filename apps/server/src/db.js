import mongoose from 'mongoose';
import { logger } from './logger.js';

export async function connectDatabase({ uri, db }) {
  mongoose.set('strictQuery', true);
  // API responses use `id` rather than Mongo's `_id` and `__v`
  mongoose.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (doc, ret) => {
      delete ret._id;
      return ret;
    },
  });
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB connection lost'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB connection restored'));

  await mongoose.connect(uri, { dbName: db, serverSelectionTimeoutMS: 15_000 });
  logger.info({ db }, 'connected to MongoDB');
}

export function disconnectDatabase() {
  return mongoose.disconnect();
}
