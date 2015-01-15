function Subscription(obj, eventType, fn) {
    this.obj = obj;
    this.eventType = eventType;
    this.fn = fn;
}

Subscription.prototype.unsubscribe = function() {
    this.obj.removeEventListener(this.eventType, this.fn);
};

module.exports = Subscription;