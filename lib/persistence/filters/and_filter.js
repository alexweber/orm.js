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
 * Filter that makes sure that both its left and right filter match
 * @param left left-hand filter object
 * @param right right-hand filter object
 */
function AndFilter (left, right) {
    this.left = left;
    this.right = right;
}

AndFilter.prototype.match = function (o) {
    return this.left.match(o) && this.right.match(o);
};

AndFilter.prototype.makeFit = function(o) {
    this.left.makeFit(o);
    this.right.makeFit(o);
};

AndFilter.prototype.makeNotFit = function(o) {
    this.left.makeNotFit(o);
    this.right.makeNotFit(o);
};

AndFilter.prototype.toUniqueString = function() {
    return this.left.toUniqueString() + " AND " + this.right.toUniqueString();
};

AndFilter.prototype.subscribeGlobally = function(coll, entityName) {
    this.left.subscribeGlobally(coll, entityName);
    this.right.subscribeGlobally(coll, entityName);
};

AndFilter.prototype.unsubscribeGlobally = function(coll, entityName) {
    this.left.unsubscribeGlobally(coll, entityName);
    this.right.unsubscribeGlobally(coll, entityName);
};

module.exports = AndFilter;