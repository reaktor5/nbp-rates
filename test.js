const nbpRates = require( './index.js' );

// nbpRates.setCache( './cache' );

nbpRates.getRates( 'a', {
    // endDate: '2002-02-01',
    // code: ['USD', 'EUR'],
    // code: 'USD',
    // limit: 100,
    // endDate: '<=2016-02-01',
} )
.then( rates => {
    console.log( rates );
} );
