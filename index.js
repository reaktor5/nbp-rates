const _ = require( 'lodash' );
const Promise = require( 'bluebird' );
const rp = require( 'request-promise' );
const iconv = require( 'iconv-lite' );
const moment = require( 'moment-timezone' );

const fs = require( 'fs' );
const path = require( 'path' );
// const xml2js = require( 'xml2js' );
// const cheerio = require( 'cheerio' );
// const encoding = require( 'encoding' );

// xml2js.parseStringAsync = Promise.promisify( xml2js.parseString );
Promise.promisifyAll( fs );


var nbpXmlUri = 'http://www.nbp.pl/kursy/xml/';

// var options = {
//     uri: nbpXmlUri + 'dir.aspx?tt=A',
//     transform: function ( body ) {
//         return cheerio.load( body );
//     }
// };

// rp( options )

// .then( $ => {
//     let $links = $( 'a' );

//     $links.each( ( i, link ) => {
//         let $link = $( link );
//         console.log( $link.attr( 'href' ) );
//         console.log( $link.text() );
//     } );
// } )

// ;

// rp( nbpXmlUri + 'dir.aspx?tt=A' )

// .then( html => {
//     let re = /href="(([abch])(\d{3})z(\d{2})(\d{2})(\d{2})\.xml)"/g;

//     let match;

//     list = [];

//     while ( ( match = re.exec( html ) ) !== null ) {
//         let meta = {
//             file: match[1],
//             tableType: match[2],
//             tableNumber: match[3],
//             year: match[4],
//             month: match[5],
//             day: match[6],
//         };

//         list.push( meta );
//     }

//     list.sort( ( a, b ) => Number( a.year + a.month + a.day ) - Number( b.year + b.month + b.day ) );

//     return list[list.length - 1];

// } )

// .then( meta => {
//     return rp( {
//         uri: nbpXmlUri + meta.file,
//         encoding: null,
//     } );
// } )

// .then( buffer => {
//     // return encoding.convert( xml, 'UTF-8', 'ISO-8859-2' );
//     // return encoding.convert( xml, 'UTF-8', 'ISO-8859-2' ).toString();
//     return iconv.decode( buffer, 'ISO-8859-2' );
// } )

// .then( xml => {
//     console.log( xml );
//     return xml2js.parseStringAsync( xml );
// } )

// .then( xmlDoc => {
//     console.log( xmlDoc.tabela_kursow.pozycja.map( position => ( {
//         name: position.nazwa_waluty[0],
//         code: position.kod_waluty[0],
//         quant: Number( position.przelicznik[0].replace( ',', '.' ) ),
//         rate: Number( position.kurs_sredni[0].replace( ',', '.' ) ),
//     } ) ) );
// } )

// ;

let _nbpRates;
let nbpRates;
let _nbpRatesCache;
let nbpRatesCache;

_nbpRatesCache = {
    cachePath: null,
    tables: {
        // a: {
        //     updatedAt: null,
        //     list: [],
        // },
        // b: {
        //     updatedAt: null,
        //     list: [],
        // },
        // c: {
        //     updatedAt: null,
        //     list: [],
        // },
    },
    cachedPath: function ( table, slug ) {
        return path.join( _nbpRatesCache.cachePath, table + '_' + slug + '.json' );
    },

    initEntryList: function( table ) {
        if ( _.has( _nbpRatesCache.tables, table ) ) {
            return Promise.resolve( true );
        }

        if ( _.isNil( _nbpRatesCache.cachePath ) ) {
            _nbpRatesCache.tables[table] = {
                updatedAt: null,
                list: [],
            };

            return Promise.resolve( true );
        }

        return fs.readFileAsync( _nbpRatesCache.cachedPath( table, 'list' ), 'utf8' )

        .then( json => {
            _nbpRatesCache.tables[table] = JSON.parse( json );
            return true;
        } )

        .catch( error => {
            _nbpRatesCache.tables[table] = {
                updatedAt: null,
                list: [],
            };
            return true;
        } )

        ;
    },
    
};

nbpRatesCache = {

    cacheEntryList: function( table, updatedAt, list ) {
        _nbpRatesCache.tables[table] = {
            updatedAt,
            list,
        };

        if ( _nbpRatesCache.cachePath === null ) {
            return Promise.resolve( false );
        }

        return fs.writeFileAsync( _nbpRatesCache.cachedPath( table, 'list' ), JSON.stringify( _nbpRatesCache.tables[table] ), 'utf8' )

        .then( () => true )

        .catch( () => false )

        ;

    },

    getUpdateDate: function ( table ) {
        return _nbpRatesCache.initEntryList( table )

        .then( () => _nbpRatesCache.tables[table].updatedAt )

        ;
    },

    getLatestEntryDate: function ( table ) {
        return _nbpRatesCache.initEntryList( table )

        .then( () => {

            return _nbpRatesCache.tables[table].list.reduce( ( max, date ) => {

                if ( max === null || date > max ) {
                    return date;
                }

                return max;

            }, null );

        } )

        ;
    },

    isEntryCached: function ( table, date ) {
        if ( _nbpRatesCache.cachePath === null ) {
            return Promise.resolve( false );
        }

        return fs.accessAsync( _nbpRatesCache.cachedPath( table, date ) )

        .then( () => true )

        .catch( () => false )

        ;
    },

    cacheEntry: function ( table, date, entry ) {
        if ( _nbpRatesCache.cachePath === null ) {
            return Promise.resolve( false );
        }

        return fs.writeFileAsync( _nbpRatesCache.cachedPath( table, date ), JSON.stringify( entry ), 'utf8' )

        .then( () => true )

        .catch( () => false )

        ;
    },

    getEntry: function ( table, date ) {
        return fs.readFileAsync( _nbpRatesCache.cachedPath( table, date ), 'utf8' )

        .then( json => JSON.parse( json ) )

        ;
    },

    queryEntryList: function ( table, query ) {
        return _nbpRatesCache.initEntryList( table )

        .then( () => {

            return _nbpRatesCache.tables[table].list
            
            .filter( date => {
                return ( query.startDate === null || query.startDate <= date ) && ( query.endDate === null || date <= query.endDate );
            } )
            
            .slice( query.startDate === null ? -query.limit : 0, query.startDate === null ? undefined : query.limit )

            ;

        } )
        
        ;
        
    },

};



_nbpRates = {

    cachedListFile: 'table-{table}-list.json',
    listUri: 'http://www.nbp.pl/kursy/xml/dir.aspx?tt={table}',
    // apiUri: 'http://www.nbp.pl/kursy/xml/',
    apiUri: 'http://api.nbp.pl/api/exchangerates/tables/{table}/{date}',
    timeZone: 'Europe/Warsaw',
    updateTime: '12:00',
    updateSlack: '00:30',
    cache: nbpRatesCache,

    /**
     * Returns a cache file path for a given table
     */
    cachedListPath: function ( table ) {
        return path.join( nbpRates.cache, _nbpRates.cachedListFile.replace( '{table}', table ) );
    },

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
     * Gets latest entry a table contains
     */
    latestTableEntry: function ( table ) {

        let max = _nbpRates.lists[table].data.reduce( ( max, filename ) => {

            let date = _nbpRates.entryToDate( current );

            if ( max === null || date !== null && date.diff( max.date ) > 0 ) {
                return { filename, date, };
            }

            return max;

        }, null );

        return max === null ? null : max.filename;

    },

    /**
     * Extracts a date of entry
     */
    entryToDate: function ( filename ) {
        let re = /[abch]\d{3}z(\d{6})\.xml/;
        let match = re.exec( filename );
        
        if ( match === null ) {
            return null;
        }

        return moment.tz( match[1], 'YYMMDD', _nbpRates.timeZone )
        .endOf( 'day' );
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

    // saveCachedList: function ( table, data ) {

    //     if ( nbpRates.cache === null ) {
    //         return Promise.resolve();
    //     }

    //     return Promise.try( () => {
    //         return JSON.stringify( data );
    //     } )

    //     .then( json => fs.writeFileAsync( _nbpRates.cachedListPath( table ), json, 'utf8' ) )

    //     ;
        
    // },

    // loadCachedList: function ( table ) {
    //     if ( nbpRates.cache === null ) {
    //         return Promise.resolve( null );
    //     }

    //     return fs.readFileAsync( _nbpRates.cachedListPath( table ), 'utf8' )

    //     .then( json => JSON.parse( json ) )

    //     .catch( err => null )

    //     ;
    // },

    // loadList: function ( table ) {

    // },

    // sortList: function( table, desc ) {
    //     let compare = desc
    //         ? ( a, b ) => {
    //             let re = /[abch]\d{3}z(\d{6})\.xml/;
    //             let matchA = a.match( re );
    //             let matchB = b.match( re );

    //             return Number( matchA[1] ) - Number( matchB[1] );
    //         }
    //         : ( a, b ) => {
    //             let re = /[abch]\d{3}z(\d{6})\.xml/;
    //             let matchA = a.match( re );
    //             let matchB = b.match( re );

    //             return Number( matchB[1] ) - Number( matchA[1] );
    //         }
    //     ;

    //     return _nbpRates.lists[table].sort( compare );

    // },

    

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
                limit = 1;
            }
        }

        if ( _.isNil( startDate ) && _.isNil( endDate ) ) {
            endDate = _nbpRates.latestPossibleEntryDate();
            limit = 1;
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

nbpRates = {

    setCache: function ( cache ) {

        if ( _.isString( cache ) ) {
            _nbpRatesCache.cachePath = cache;
            _nbpRates.cache = nbpRatesCache;
        }

        _nbpRates.cache = cache;

    },

    getRates: function ( table, query ) {

        let q = _nbpRates.parseQuery( query );

        // console.log( 'q:', q );

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

    getTableList: function ( table ) {

        _nbpRates.loadCachedList( table )

        .then( list => list === null
                     ? _nbpRates.requestList( table )
                     : list
        )



        return rp( {
            uri: nbpXmlUri + 'dir.aspx?tt=' + type,
            encoding: null,
        } )

        .then( buffer => iconv.decode( buffer, 'ISO-8859-2' ) )

        .then( html => {
            let re = /href="(([abch])(\d{3})z(\d{2})(\d{2})(\d{2})\.xml)"/g;

            let match;

            list = [];

            while ( ( match = re.exec( html ) ) !== null ) {
                let meta = {
                    file: match[1],
                    tableType: match[2],
                    tableNumber: match[3],
                    year: match[4],
                    month: match[5],
                    day: match[6],
                };

                list.push( meta );
            }

            list.sort( ( a, b ) => Number( a.year + a.month + a.day ) - Number( b.year + b.month + b.day ) );

            return list;

        } )
        
        ;
    },

    getTable: function ( file ) {

        return Promise.try( () => {

            if ( this.cache ) {
                // use path
                console.log( 'trying to read' );
                return fs.readFileAsync( this.cache + '/' + file );
            }

            console.log( 'not trying to read' );

            throw new Error( 'cache disabled' );
            // return rp( {
            //     uri: nbpXmlUri + file,
            //     encoding: null,
            // } )

        } )

        .catch( () => {

            console.log( 'trying to download' );

            return rp( {
                uri: nbpXmlUri + file,
                encoding: null,
            } )

            .then( buffer => {

                return fs.writeFileAsync( this.cache + '/' + file, buffer )

                .then( () => buffer )

                ;
                
            } )

            ;

        } )

        .then( buffer => iconv.decode( buffer, 'ISO-8859-2' ) )

        .then( xml => xml2js.parseStringAsync( xml ) )

        .then( xmlDoc => xmlDoc.tabela_kursow.pozycja.map( position => ( {
            // name: position.nazwa_waluty[0],
            code: position.kod_waluty[0],
            quant: Number( position.przelicznik[0].replace( ',', '.' ) ),
            rate: Number( position.kurs_sredni[0].replace( ',', '.' ) ),
        } ) ) )

        ;

    },
    
};

// module.exports.getTableList( 'a' )

// .then( tableList => {

//     console.log( tableList );

// } )

// ;


module.exports.cache = './cache';
// module.exports.getTable( 'a171z160905.xml' )

// module.exports.getTableList( 'a' )

// .then( tableList => {
//     let last = Promise.resolve();

//     tableList.forEach( tableMeta => {
        
//         last = last.then( () => {
//             return module.exports.getTable( tableMeta.file );
//         } );

//     } )

//     return last;
// } )

// ;

// fs.readFileAsync( module.exports.cache + '/eurofxref-hist.xml' )

// .then( xml => xml2js.parseStringAsync( xml ) )

// .then( xmlDoc => {

//     console.log( xmlDoc['gesmes:Envelope']['Cube'][0]['Cube'][0]['Cube'] );

// } )

// ;


// /href="(.+)"/g

module.exports = nbpRates;
