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
class AndFilter {
    constructor (left, right) {
        this.left = left;
        this.right = right;
    }

    match (o) {
        return this.left.match(o) && this.right.match(o);
    }

    makeFit (o) {
        this.left.makeFit(o);
        this.right.makeFit(o);
    }

    makeNotFit (o) {
        this.left.makeNotFit(o);
        this.right.makeNotFit(o);
    }

    toUniqueString () {
        return this.left.toUniqueString() + " AND " + this.right.toUniqueString();
    }

    subscribeGlobally (coll, entityName) {
        this.left.subscribeGlobally(coll, entityName);
        this.right.subscribeGlobally(coll, entityName);
    };

    unsubscribeGlobally (coll, entityName) {
        this.left.unsubscribeGlobally(coll, entityName);
        this.right.unsubscribeGlobally(coll, entityName);
    };
}

module.exports = AndFilter;