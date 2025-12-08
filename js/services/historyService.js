class HistoryService {
    constructor() {
        this.history = [];
        this.limit = 20;
    }

    push(snapshot) {
        const serialized = JSON.stringify(snapshot);
        this.history.push(serialized);
        if (this.history.length > this.limit) {
            this.history.shift();
        }
    }

    pop() {
        if (!this.history.length) return null;
        const snapshot = this.history.pop();
        return JSON.parse(snapshot);
    }

    canUndo() {
        return this.history.length > 0;
    }
}
