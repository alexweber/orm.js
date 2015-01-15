/*
 * Each filter has 4 methods:
 * - sql(prefix, values) -- returns a SQL representation of this filter,
 *     possibly pushing additional query arguments to `values` if ?'s are used
 *     in the query
 * - match(o) -- returns whether the filter matches the object o.
 * - makeFit(o) -- attempts to adapt the object o in such a way that it matches
 *     this filter.
 * - makeNotFit(o) -- the oppositive of makeFit, makes the object o NOT match
 *     this filter
 */
/**
 * Filter that makes sure that either its left and right filter match
 * @param left left-hand filter object
 * @param right right-hand filter object
 */
function OrFilter (left, right) {
    this.left = left;
    this.right = right;
}

OrFilter.prototype.match = function (o) {
    return this.left.match(o) || this.right.match(o);
};

OrFilter.prototype.makeFit = function(o) {
    this.left.makeFit(o);
    this.right.makeFit(o);
};

OrFilter.prototype.makeNotFit = function(o) {
    this.left.makeNotFit(o);
    this.right.makeNotFit(o);
};

OrFilter.prototype.toUniqueString = function() {
    return this.left.toUniqueString() + " OR " + this.right.toUniqueString();
};

OrFilter.prototype.subscribeGlobally = function(coll, entityName) {
    this.left.subscribeGlobally(coll, entityName);
    this.right.subscribeGlobally(coll, entityName);
};

OrFilter.prototype.unsubscribeGlobally = function(coll, entityName) {
    this.left.unsubscribeGlobally(coll, entityName);
    this.right.unsubscribeGlobally(coll, entityName);
};

module.exports = OrFilter;