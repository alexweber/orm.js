var Subscription = require('./subscription');

/**
 * Simple observable function constructor
 * @constructor
 */
function Observable() {
    this.subscribers = {};
}

Observable.prototype.addEventListener = function (eventType, fn) {
    if (!this.subscribers[eventType]) {
        this.subscribers[eventType] = [];
    }
    this.subscribers[eventType].push(fn);
    return new Subscription(this, eventType, fn);
};

Observable.prototype.removeEventListener = function(eventType, fn) {
    var subscribers = this.subscribers[eventType];
    for ( var i = 0; i < subscribers.length; i++) {
        if(subscribers[i] == fn) {
            this.subscribers[eventType].splice(i, 1);
            return true;
        }
    }
    return false;
};

Observable.prototype.triggerEvent = function (eventType) {
    if (!this.subscribers[eventType]) { // No subscribers to this event type
        return;
    }
    var subscribers = this.subscribers[eventType].slice(0);
    for(var i = 0; i < subscribers.length; i++) {
        subscribers[i].apply(null, arguments);
    }
};

module.exports = Observable;