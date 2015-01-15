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
 * Default filter that does not filter on anything
 * currently it generates a 1=1 SQL query, which is kind of ugly
 */
function NullFilter () {
}

NullFilter.prototype.match = function (o) {
    return true;
};

NullFilter.prototype.makeFit = function(o) {
};

NullFilter.prototype.makeNotFit = function(o) {
};

NullFilter.prototype.toUniqueString = function() {
    return "NULL";
};

NullFilter.prototype.subscribeGlobally = function() { };

NullFilter.prototype.unsubscribeGlobally = function() { };

module.exports = NullFilter;