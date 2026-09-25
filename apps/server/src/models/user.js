import mongoose from 'mongoose';

export const ROLES = ['viewer', 'responder', 'admin'];

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'viewer' },
  },
  { timestamps: true },
);

userSchema.methods.toSession = function toSession() {
  return { id: this.id, email: this.email, name: this.name, role: this.role };
};

export const User = mongoose.model('User', userSchema);
