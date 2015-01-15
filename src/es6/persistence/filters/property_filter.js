var util = require('../util');
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
 * Filter that checks whether a certain property matches some value, based on an
 * operator. Supported operators are '=', '!=', '<', '<=', '>' and '>='.
 * @param property the property name
 * @param operator the operator to compare with
 * @param value the literal value to compare to
 */
class PropertyFilter {
    constructor(property, operator, value) {
        this.property = property;
        this.operator = operator.toLowerCase();
        this.value = value;
    }

    match(o) {
        var value = this.value;
        var propValue = persistence.get(o, this.property);
        if (value && value.getTime) { // DATE
            // TODO: Deal with arrays of dates for 'in' and 'not in'
            value = Math.round(value.getTime() / 1000) * 1000; // Deal with precision
            if (propValue && propValue.getTime) { // DATE
                propValue = Math.round(propValue.getTime() / 1000) * 1000; // Deal with precision
            }
        }
        switch (this.operator) {
            case '=':
                return propValue === value;
                break;
            case '!=':
                return propValue !== value;
                break;
            case '<':
                return propValue < value;
                break;
            case '<=':
                return propValue <= value;
                break;
            case '>':
                return propValue > value;
                break;
            case '>=':
                return propValue >= value;
                break;
            case 'in':
                return util.arrayContains(value, propValue);
                break;
            case 'not in':
                return !util.arrayContains(value, propValue);
                break;
        }
    }

    makeFit(o) {
        if (this.operator === '=') {
            persistence.set(o, this.property, this.value);
        } else {
            throw new Error("Sorry, can't perform makeFit for other filters than =");
        }
    }

    makeNotFit(o) {
        if (this.operator === '=') {
            persistence.set(o, this.property, null);
        } else {
            throw new Error("Sorry, can't perform makeNotFit for other filters than =");
        }
    }

    subscribeGlobally(coll, entityName) {
        persistence.subscribeToGlobalPropertyListener(coll, entityName, this.property);
    }

    unsubscribeGlobally(coll, entityName) {
        persistence.unsubscribeFromGlobalPropertyListener(coll, entityName, this.property);
    }

    toUniqueString() {
        var val = this.value;
        if (val && val._type) {
            val = val.id;
        }
        return this.property + this.operator + val;
    }
}

module.exports = PropertyFilter;