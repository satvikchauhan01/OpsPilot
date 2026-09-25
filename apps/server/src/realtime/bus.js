import { EventEmitter } from 'node:events';

// In-process pub/sub between the parts of the server that change state (ingestion, change
// tracking, investigations) and the SSE endpoint that pushes those changes to browsers.
class EventBus extends EventEmitter {
  publish(type, data) {
    this.emit('event', { type, data, at: new Date().toISOString() });
  }
}

export const bus = new EventBus();
bus.setMaxListeners(0);
