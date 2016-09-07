const _ = require( 'lodash' );
const Promise = require( 'bluebird' );
const rp = require( 'request-promise' );
const iconv = require( 'iconv-lite' );
const moment = require( 'moment-timezone' );
const mkdirp = require( 'mkdirp-bluebird' );

const fs = require( 'fs' );
const path = require( 'path' );

const accessAsync = Promise.promisify( fs.access );
const readFileAsync = Promise.promisify( fs.readFile );
const writeFileAsync = Promise.promisify( fs.writeFile );

let _nbpRates;
let nbpRates;
let _nbpRatesCache;
let nbpRatesCache;

/**
 * ENTRY CACHE: private methods
 */
_nbpRatesCache = {
    cachePath: null,
    tables: {},
    initPromise: null,

    /**
     * Returns a path to a cached object.
     * @param {string} table - Table type.
     * @param {string} name - Object name.
     * @returns {string}
     */
    cachedPath: function ( table, name ) {
        return path.join( _nbpRatesCache.cachePath, table + '_' + name + '.json' );
    },

    /**
     * Initiates cache metadata for a given table.
     * @param {string} table - Table type.
     * @returns {Promise}
     */
    initEntryList: function( table ) {

        // if already initiated return last promise
        if( _nbpRatesCache.initPromise ) {
            return _nbpRatesCache.initPromise;
        }

        // if no fs cache - don't try to read
        if ( _.isNil( _nbpRatesCache.cachePath ) ) {
            _nbpRatesCache.tables[table] = {
                updatedAt: null,
                list: [],
            };

            _nbpRatesCache.initPromise = Promise.resolve();
            return _nbpRatesCache.initPromise;
        }

        // make sure cache dir exists
        _nbpRatesCache.initPromise = mkdirp( _nbpRatesCache.cachePath )

        // try to read list from fs
        .then( () => readFileAsync( _nbpRatesCache.cachedPath( table, 'list' ), 'utf8' ) )

        // parse data
        .then( json => {
            _nbpRatesCache.tables[table] = JSON.parse( json );
        } )

        // there was no file - init with empty values
        .catch( error => {
            _nbpRatesCache.tables[table] = {
                updatedAt: null,
                list: [],
            };
        } )

        ;

        return _nbpRatesCache.initPromise;

    },
    
};

/**
 * ENTRY CACHE: public methods
 */
nbpRatesCache = {

    /**
     * Writes an entry list to cache tagging it with a 'updatedAt' date.
     * @param {string} table - Table type.
     * @param {string} updatedAt - Update date to set.
     * @param {string[]} list - Entry list to cache, always given sorted.
     * @returns {Promise}
     */
    cacheEntryList: function( table, updatedAt, list ) {

        // make sure cache is initiated
        return _nbpRatesCache.initEntryList( table )

        .then( () => {

            _nbpRatesCache.tables[table] = {
                updatedAt,
                list,
            };

            // fs cache disabled
            if ( _.isNil( _nbpRatesCache.cachePath ) ) {
                return;
            }

            // write data to fs
            return writeFileAsync( _nbpRatesCache.cachedPath( table, 'list' ), JSON.stringify( _nbpRatesCache.tables[table] ), 'utf8' );

        } )

        ;
    },

    /**
     * Get the date when the cached table was last updated.
     * @param {string} table - Table type.
     * @returns {Promise<string|null>}
     */
    getUpdateDate: function ( table ) {

        // make sure cache is initiated
        return _nbpRatesCache.initEntryList( table )

        // return the update date
        .then( () => _nbpRatesCache.tables[table].updatedAt )

        ;
    },

    /**
     * Get a last entry of a table.
     * @param {string} table - Table type.
     * @returns {Promise<string|null>}
     */
    getLatestEntryDate: function ( table ) {

        // make sure cache is initiated
        return _nbpRatesCache.initEntryList( table )

        .then( () => {

            let entryList = _nbpRatesCache.tables[table].list;
            let entryCount = entryList.length;

            return entryCount > 0
                 ? entryList[entryCount - 1]
                 : null
            ;

        } )

        ;

    },

    /**
     * Check if an entry was cached.
     * @param {string} table - Table type.
     * @param {string} date - Entry date.
     * @returns {Promise<boolean>}
     */
    isEntryCached: function ( table, date ) {

        if ( _.isNil( _nbpRatesCache.cachePath ) ) {
            return Promise.resolve( false );
        }

        return accessAsync( _nbpRatesCache.cachedPath( table, date ) )

        .then( () => true )

        .catch( () => false )

        ;

    },

    /**
     * Writes an entry to cache under a given date.
     * @param {string} table - Table type.
     * @param {string} date - Entry date.
     * @param {Object} entry - Entry object.
     * @returns {Promise}
     */
    cacheEntry: function ( table, date, entry ) {
        
        if ( _.isNil( _nbpRatesCache.cachePath ) ) {
            return Promise.resolve();
        }

        return writeFileAsync( _nbpRatesCache.cachedPath( table, date ), JSON.stringify( entry ), 'utf8' );

    },

    /**
     * Gets an entry from cache.
     * @param {string} table - Table type.
     * @param {string} date - Entry date.
     * @returns {Promise<Object>}
     */
    getEntry: function ( table, date ) {

        return readFileAsync( _nbpRatesCache.cachedPath( table, date ), 'utf8' )

        .then( json => JSON.parse( json ) )

        ;

    },

    /**
     * Gets an entry from cache.
     * @param {string} table - Table type.
     * @param {Object} query - Query object, containing following keys:
     *                         {string|null} startDate - earliest valid date to use
     *                         {string|null} endDate - latest valid date to use
     *                         {number} limit - number of records to use
     *                                          positive value selects earliest entries
     *                                          zero is no limit
     *                                          negative value selects latest entries
     * @returns {Promise<string[]>} List of matching entry dates.
     */
    queryEntryList: function ( table, query ) {

        // make sure cache is initiated
        return _nbpRatesCache.initEntryList( table )

        .then( () => {

            let begin = query.limit < 0 ? query.limit : 0;
            let end = query.limit > 0 ? query.limit : undefined;

            return _nbpRatesCache.tables[table].list
            
            .filter( date => {
                return ( query.startDate === null || query.startDate <= date ) && ( query.endDate === null || date <= query.endDate );
            } )
            
            .slice( begin, end )

            ;

        } )
        
        ;
        
    },

};

/**
 * NBP_RATES: private methods
 */
_nbpRates = {

    listUri: 'http://www.nbp.pl/kursy/xml/dir.aspx?tt={table}',
    apiUri: 'http://api.nbp.pl/api/exchangerates/tables/{table}/{date}',
    timeZone: 'Europe/Warsaw',
    updateTime: '16:00',
    updateSlack: '00:15',
    cache: nbpRatesCache,

    /**
     * Gets latest possible entry date
     */
    latestPossibleEntryDate: function () {
        return moment().tz( _nbpRates.timeZone )
        .subtract( moment.duration( _nbpRates.updateTime ) )
        .subtract( moment.duration( _nbpRates.updateSlack ) )
        .format( 'YYYY-MM-DD' );
    },

    /**
     * Gets latest date that has no possibility of new entries
     */
    latestCoveredDate: function ( table ) {
        let updateDate = _nbpRates.cache.getUpdateDate( table );
        let latestEntryDate = _nbpRates.cache.getLatestEntryDate( table );

        return Promise.all( [
            _nbpRates.cache.getUpdateDate( table ),
            _nbpRates.cache.getLatestEntryDate( table ),
        ] )

        .then( args => {
            let updateDate = args[0];
            let latestEntryDate = args[1];

            if ( updateDate === null ) {
                return latestEntryDate;
            }

            if ( latestEntryDate === null ) {
                return updateDate;
            }
            
            return updateDate > latestEntryDate ? updateDate : latestEntryDate;
        } )

    },

    cacheCoversDate: function ( table, date ) {

        return _nbpRates.latestCoveredDate( table )

        .then( latestCoveredDate => {
            return latestCoveredDate !== null && latestCoveredDate >= date;
        } )

    },

    updateList: function( table ) {
        return rp( {
            uri: _nbpRates.listUri.replace( '{table}', table ),
            encoding: null,
        } )

        // decode from iso
        .then( buffer => iconv.decode( buffer, 'ISO-8859-2' ) )

        // exract table files
        .then( html => {
            let list = [];
            let re = /href="[abc]\d{3}z(\d{6})\.xml"/g;
            let match;

            while ( ( match = re.exec( html ) ) !== null ) {
                list.push( moment( match[1], 'YYMMDD' ).format( 'YYYY-MM-DD' ) );
            }

            return list.sort();

        } )

        // save to cache
        .then( list => {
            let date = _nbpRates.latestPossibleEntryDate();
            return _nbpRates.cache.cacheEntryList( table, date, list );
        } )

        ;
    },

    parseEntry: function ( table, json ) {

        let entries = JSON.parse( json );

        return entries[0].rates.reduce(
            ( result, rate ) => _.set( result, rate.code, rate.mid ),
            {}
        );

    },

    requestEntry: function ( table, date ) {
        return rp( {
            uri: _nbpRates.apiUri
                          .replace( '{table}', table )
                          .replace( '{date}', date ),
            headers: {

            },
        } )

        .then( json => {
            return _nbpRates.parseEntry( table, json );
        } )

        ;
    },

    getEntry: function ( table, date ) {

        return _nbpRates.cache.isEntryCached( table, date )

        .then( isEntryCached => {
            // console.log( 'cached', isEntryCached );

            if ( isEntryCached ) {
                return _nbpRates.cache.getEntry( table, date )
            } else {
                return _nbpRates.requestEntry( table, date )

                .then( entry => {
                    return _nbpRates.cache.cacheEntry( table, date, entry )
                    .then( () => entry )
                    ;
                } )

                ;
            }
        } )

    },

    getEntries: function ( table, entryList, code ) {
        let entryPromises = entryList.map( date => {
            return _nbpRates.getEntry( table, date )

            .then( entry => _nbpRates.filterEntryByCode( entry, code ) )

            ;
        } );

        return Promise.all( entryPromises )
        
        .then( entries => _.zipObject( entryList, entries ) )
        
        ;
    },

    filterEntryByCode: function ( entry, code ) {
        if ( _.isArray( code ) ) {
            if ( _.isEmpty( code ) ) {
                return entry;
            }
            return _.pick( entry, code );
        }

        return entry[code];
    },

    parseQuery: function( query ) {

        let startDate = null, endDate = null, limit = null, code;

        if ( _.isNil( query ) ) {
            query = {};
        }

        if ( _.has( query, 'date' ) ) {
            let date = query.date;

            switch ( date[0] ) {
                case '>':
                startDate = date;
                break;
                
                case '<':
                endDate = date;
                break;

                case '=':
                startDate = endDate = date.slice(1);
                break;

                default:
                startDate = endDate = date;
                break;
            }
        }

        if ( _.has( query, 'startDate' ) ) {
            startDate = query.startDate;
        }

        if ( _.has( query, 'endDate' ) ) {
            endDate = query.endDate;
        }

        if ( ! _.isNil( startDate ) && startDate.startsWith( '>' ) ) {
            startDate = startDate.slice( 1 );

            if ( startDate.startsWith( '=' ) ) {
                startDate = startDate.slice( 1 );
            } else {
                startDate = moment( startDate )
                .add( 1, 'day' )
                .format( 'YYYY-MM-DD' );
            }

            if ( _.isNil( endDate ) ) {
                limit = 1;
            }
        }

        if ( ! _.isNil( endDate ) && endDate.startsWith( '<' ) ) {
            endDate = endDate.slice( 1 );

            if ( endDate.startsWith( '=' ) ) {
                endDate = endDate.slice( 1 );
            } else {
                endDate = moment( endDate )
                .subtract( 1, 'day' )
                .format( 'YYYY-MM-DD' );
            }

            if ( _.isNil( startDate ) ) {
                limit = -1;
            }
        }

        let latestPossibleEntryDate = _nbpRates.latestPossibleEntryDate();

        if ( _.isNil( endDate ) || endDate > latestPossibleEntryDate ) {
            endDate = latestPossibleEntryDate;

            if ( _.isNil( startDate ) ) {
                limit = -1;
            }
        }
            
        if ( _.has( query, 'limit' ) ) {
            limit = query.limit;
        }

        code = [];

        if ( _.has( query, 'code' ) ) {
            if ( _.isArray( query.code ) || _.isString( query.code ) ) {
                code = query.code;
            }
        }

        return {
            startDate,
            endDate,
            limit,
            code,
        };

    },

};

/**
 * NBP_RATES: public methods
 */
nbpRates = {

    setCache: function ( cache ) {

        if ( _.isString( cache ) ) {
            _nbpRatesCache.cachePath = cache;
            _nbpRates.cache = nbpRatesCache;
        } else {
            _nbpRates.cache = cache;
        }

    },

    getRates: function ( table, query ) {

        let q = _nbpRates.parseQuery( query );

        return _nbpRates.cacheCoversDate( table, q.endDate )

        .then( cacheCoversDate => {
            if ( ! cacheCoversDate ) {
                return _nbpRates.updateList( table );
            }
        } )

        .then( () => {
            return _nbpRates.cache.queryEntryList( table, q );
        } )

        .then( entryList => {
            return _nbpRates.getEntries( table, entryList, q.code );
        } )

    },
    
};

module.exports = nbpRates;
