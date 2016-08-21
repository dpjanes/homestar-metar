# homestar-metar
IOTDB Module for [METAR Observations](https://en.wikipedia.org/wiki/METAR).

<img src="https://raw.githubusercontent.com/dpjanes/iotdb-homestar/master/docs/HomeStar.png" align="right" />

This will pull in thousands of weather observations from around the world as semantic data. It will also check every minute for updates.

## Data Source

* Observations are pulled from [NOAA here](http://weather.noaa.gov/pub/data/observations/metar/cycles/).
* Station metadata is pulled from [NOAA here](http://weather.noaa.gov/data/nsd_bbsss.txt).

## Raw Data

Data can be pulled from METAR without IOTDB adding semantic structure.
See [connect.js](https://github.com/dpjanes/homestar-metar/blob/master/samples/connect.js) for an example.

# Installation

[Install Home☆Star first](https://homestar.io/about/install).

Then:

    $ homestar install homestar-metar
    $ homestar configure homestar-metar
    
The configure command simply pulls down all the station metadata. 
There is no user interaction required

## IOTDB

### Get everything

	$ node
	>>> iotdb = require('iotdb')
	>>> things = iotdb.connect("MetarObservation")
	

### Get one specific station

	$ node
	>>> iotdb = require('iotdb')
	>>> things = iotdb.connect("MetarObservation", {
        station: "CYYZ",
    })

### Get set of stations
	
	$ node
	>>> iotdb = require('iotdb')
	>>> things = iotdb.connect("MetarObservation", {
        station: "C???",
    })

See [https://github.com/isaacs/minimatch](minimatch) for glob matching patterns.

# Models
## MetarObservation

See [MetarObservation.iotql](https://github.com/dpjanes/homestar-metar/blob/master/models/MetarObservation.iotql)
