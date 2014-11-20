/*
  --------------------------------------------------------------------

  Fragmented Portraiture
  Author: Mike Creighton <mike (at) mikecreighton (dot) com>

  A generative portraiture application built during the November 2014
  PDX Creative Coders uncontext Hack Day.

  This document is licensed as free software under the terms of the
  MIT License: http://www.opensource.org/licenses/mit-license.php

  All libaries used in this project retain their original respective
  licenses and have not been modified from their original form.

  ----------------------------------------------------------------------
*/
var App = function($) {

  var MINUTE                        = 60 * 1000;
  var DRAW_DURATION                 = 10 * MINUTE; // Only draw for 10 minutes
  var SCREENSHOT_INTERVAL_DURATION  = 0.5 * MINUTE; // Every 30 seconds
  var FLICKR_API_KEY                = 'd4aaabd96ee06e616ca183d4c131cdb5'; // Substitute your own Flickr API key here.
  var FLICKR_API_REST               = 'https://api.flickr.com/services/rest/?method=';
  var BASE_URL                      = window.location.href.split('?')[0];
  var GET_IMAGE_DATA_URL            = BASE_URL + 'getimagedata.php';
  var SAVE_IMAGE_DATA_URL           = BASE_URL + 'saveimagedata.php';
  var MAX_FAILURES = 5;
  var MAX_IMG_W = 1600, MAX_IMG_H = 1600;
  var IMG_W, IMG_H;
  var DO_SAVE_IMAGE_ON_COMPLETION = false;
  var DO_SCREENSHOTS = false;

  var COLOR_RESOLUTION = 1000;
  var STROKE_SCALE = 1.0;
  var MAX_STROKE_LENGTH;
  var MIN_STROKE_DUR = 1.50;
  var MAX_STROKE_DUR = 2.00;
  var MIN_STROKE_WIDTH = 15;
  var MAX_STROKE_WIDTH = 130;

  // Keep an easy reference to the app instance
  var that = this;
  var numFailures = 0;
  var canvas = document.getElementById('canvas');
  var imgCanvas = document.getElementById('image-loader');
  var imgCtx = imgCanvas.getContext('2d');
  var ctx = canvas.getContext("2d");
  var grad; // Color gradient for creating color list.
  var gradHexes = [];
  var colors; // ColorList for sampling.
  var isFirstStart;
  var isFirstImage;
  var isProcessingNewImage;
  var didEncounterError;
  var screenshotInterval;
  var $username = $('#username');
  var $photourl = $('#photourl');
  var $canvases = $('canvas');

  // Canned IDs that yield good output.
  var USE_CANNED_PHOTOS = true;
  var flickrPhotoIds = [
      '2955654946',
      '3641009730',
      '4289130070',
      '5192026307',
      '4925309600',
      '13485099485',
      '7386170676',
      '427137773',
      '590034637',
      '8007229641',
      '4659033632',
      '3513148755',
      '13473587084',
      '15753479792',
      '11575548475',
      '1366705528',
      '8506397510',
      '2806839156',
      '6242923113',
      '14456075721',
      '8024280392',
      '4236721526',
      '2615660715',
      '14430646744',
      '3306798893',
      '7310991808',
      '8142027393',
      '14837743824',
      '5339154315',
      '10268802005',
      '2965467338',
      '8496119248',
      '5459812816',
      '8537324028',
      '4280569659',
      '11423305963',
      '9279331760',
      '4887810576',
      '8021108077',
      '3043159407',
      '8377318802',
      '8990304927',
      '9584063578',
      '29040270',
      '10199947655',
      '214921444',
      '6488890293',
      '2893622378',
      '6733648763',
      '14644634332',
      '5060713794',
      '14265184112',
      '9223558988',
      '6175212804',
      '5809343703',
      '2443074725',
      '405952980',
      '9349804123',
      '8640290017',
      '14042135554',
      '3200195203',
      '7002321703',
      '5617779248',
      '3378819836',
      '5472021986'
    ];

  // Variables storing info about the current Flickr image we're dealing with.
  var imageUrl;
  var photopageUrl;
  var ownerName;
  var ownerNSID;
  var ownerUsername;
  var currFlickrPageResponse;
  var currFlickrImageIndex;
  var currFlickrPage;

  // WebSocket connection
  var sock;
  // Stores last incoming data from uncontext WebSocket
  var lastData;

  // Stores all the marks being made (animations).
  var markCount = 0;
  var marks = {};
  var Mark = function() {
    this.start=    new toxi.geom.Vec2D(); // start position
    this.dest=     new toxi.geom.Vec2D(); // destination position
    this.target=   new toxi.geom.Vec2D(); // heading target
    this.vector=   new toxi.geom.Vec2D(); // represents the actual vector for the stroke, when added to start.
    this.last=     new toxi.geom.Vec2D();
    this.width=    0;
    this.progress= 0;
    this.alpha=    0;
    this.maxAlpha= 0;
    this.minAlpha= 0;
    this.lastProgress = 0;
  };

  /**

    Initializes the app.

  */
  this.init = function (){

    console.log("App :: init()");

    isFirstStart = true;
    isFirstImage = true;
    didEncounterError = false;
    isProcessingNewImage = false;

    // Check to see if we've got a query string, should we be coming in from a reload due to errors.
    var lastFlickrImageIndex = -1;
    var lastFlickrPage = 0;
    if(window.location.href.indexOf('?') > -1) {
      var query = window.location.href.split('?')[1];
      var queryPieces = query.split('&');
      if(queryPieces.length > 0) {
        for(var i = 0; i < queryPieces.length; i++) {
          var nameVal = queryPieces[i];
          var nameValPieces = nameVal.split('=');
          if(nameValPieces.length === 2) {
            switch(nameValPieces[0]) {
              case 'image':
              isFirstImage = false;
              lastFlickrImageIndex = parseInt(nameValPieces[1], 10);
              break;
              case 'page':
              lastFlickrPage = parseInt(nameValPieces[1], 10);
              break;
            }
          }
        }
      }
    }

    // Set up our image and page indices
    currFlickrImageIndex = lastFlickrImageIndex > -1 ? lastFlickrImageIndex : -1;
    currFlickrPage = lastFlickrPage > 0 ? lastFlickrPage : 1;

    // Set up our color gradients.
    gradHexes = [
      ['260c2b', '865316', 'fff5c5'],
      ['064243', 'b6851d', 'f5f6a3'],
      ['020f25', 'd24faf', 'dcf7ac'],
      ['252400', 'c57020', 'ebd2ba'],
      ['0c0b19', '20a8c5', 'd1fae6'],
      ['1d1d1d', '7e8c8f', 'eeeeee'],
      ['0d1e2a', '2a7e73', 'edc97b', 'fef5d9'],
      ['20030c', '7d311d', '85b579', 'ecfed9'],
      ['280221', '7b3e5f', 'a9a763', 'fefed9'],
      ['021c1a', '195a52', 'c59775', 'f4f3bc']
    ];

    this.requestNextImage();
  };

  /**

    Starts the cycle of getting the next image and requesting a page response
    if we're out of bounds or don't have a response in memeory yet.

  */
  this.requestNextImage = function(){
    isProcessingNewImage = true;

    if(numFailures >= MAX_FAILURES) {
      console.error("Reached maximum number of failures. Attempting to reload where we left off.");
      var newLocation = window.location.href.split('?')[0];
      newLocation += '?image=' + currFlickrImageIndex + '&page=' + currFlickrPage;
      window.location.href = newLocation;
    }

    // First, let's check to see if we have any current search page response from Flickr.
    if(typeof currFlickrPageResponse === 'undefined' && ! USE_CANNED_PHOTOS) {

      this.requestFlickrSearchResponse();

    } else {

      // Increment if we didn't encouter an error during our handling of the image.
      if( ! didEncounterError) {
        currFlickrImageIndex++;
      }

      didEncounterError = false;

      if(USE_CANNED_PHOTOS) {

        if(isFirstImage) {
          // Get a random image from our first response if none was originally set via query param.
          isFirstImage = false;
          currFlickrImageIndex = Math.floor(Math.random() * flickrPhotoIds.length);
        }

        if(currFlickrImageIndex >= flickrPhotoIds.length) {

          currFlickrImageIndex = 0;

        }

        this.requestFlickrPhotoSizesResponse();


      } else {
        if(currFlickrImageIndex >= currFlickrPageResponse.photos.photo.length) {

          currFlickrImageIndex = 0;
          currFlickrPage++;
          this.requestFlickrSearchResponse();

        } else {

          this.processNextImage();

        }
      }

    }
  };

  /**

    Gets a new search page response from Flickr.

  */
  this.requestFlickrSearchResponse = function() {
    var request = FLICKR_API_REST + 'flickr.photos.search';
    request    += '&api_key=' + FLICKR_API_KEY;
    request    += '&text=portrait';
    request    += '&license=5';
    request    += '&privacy_filter=1';
    request    += '&content_type=1';
    request    += '&media=photos';
    request    += '&per_page=100';
    request    += '&extras=url_l';
    request    += '&sort=interestingness-desc';
    request    += '&page=' + currFlickrPage;
    request    += '&format=json';

    jQuery.ajax({
      dataType: 'jsonp',
      url: request,
      type: 'GET',
      error: function(xhr, textStatus) {
        if(textStatus !== 'parsererror') {
          console.error("AJAX flickr.photos.search :: error", textStatus);
          didEncounterError = true;
          numFailures++;
          that.requestNextImage();
        }
      }
    });
  };

  this.requestFlickrPhotoSizesResponse = function() {
    // First we get the images sizes.
    var request = FLICKR_API_REST + 'flickr.photos.getSizes';
    request    += '&api_key=' + FLICKR_API_KEY;
    request    += '&photo_id=' + flickrPhotoIds[currFlickrImageIndex];
    request    += '&format=json';
    jQuery.ajax({
      dataType: 'jsonp',
      url: request,
      type: 'GET',
      error: function(xhr, textStatus) {
        console.error("AJAX flickr.photos.getInfo :: error", textStatus);
        if(textStatus !== 'parsererror') {
          didEncounterError = true;
          numFailures++;
          that.requestNextImage();
        }
      }
    });
  };

  /**

    Figures out which image to fetch info for.

  */
  this.processNextImage = function() {

    if(USE_CANNED_PHOTOS) {



    } else {

      if(isFirstImage) {
        // Get a random image from our first response if none was originally set via query param.
        isFirstImage = false;
        currFlickrImageIndex = Math.floor(Math.random() * currFlickrPageResponse.photos.photo.length);
      }

      console.log('processNextImage() ----------', currFlickrImageIndex);
      var photo = currFlickrPageResponse.photos.photo[currFlickrImageIndex];

      // Need to make sure we have a large photo URL to work with.
      if( ! photo.url_l) {

        this.requestNextImage();

      } else {
        imageUrl = photo.url_l;

        if(photo.id) {
          console.log("New Photo URL: " + imageUrl + " | Photo ID: " + photo.id);
          this.requestPhotoInfo(photo.id);
        }
      }

    }

  };

  /**

    Get the info about a photo.

  */
  this.requestPhotoInfo = function(photoId) {
    var request = FLICKR_API_REST + 'flickr.photos.getInfo';
    request    += '&api_key=' + FLICKR_API_KEY;
    request    += '&photo_id=' + photoId;
    request    += '&format=json';
    jQuery.ajax({
      dataType: 'jsonp',
      url: request,
      type: 'GET',
      error: function(xhr, textStatus) {
        console.error("AJAX flickr.photos.getInfo :: error", textStatus);
        if(textStatus !== 'parsererror') {
          didEncounterError = true;
          numFailures++;
          that.requestNextImage();
        }
      }
    });
  };


  /**

    Internal callback for the JSONP response from Flickr.

  */
  this.handleFlickrResponse = function(data) {

    console.log("FLICKR RESPONSE -------------------");
    console.log(data);

    // Handles the call for getting a full page's details.
    if(data.photos) {
      // Store the response.
      currFlickrPageResponse = data;

      if(data.photos.photo) {
        if(data.photos.photo.length > 0) {

          this.processNextImage();

        }
      }
    }

    // Handles a specific photo's information.
    if(data.photo) {
      photopageUrl = data.photo.urls.url[0]._content;
      ownerUsername = data.photo.owner.username;
      ownerName     = data.photo.owner.realname;
      ownerNSID     = data.photo.owner.nsid;

      $photourl.attr('href', photopageUrl);
      $photourl.html(photopageUrl);
      $username.html('Image by: ' + ownerUsername);

      // Now pass it through our proxy script to get the image into our canvas for reading.
      $.getImageData({
        url: imageUrl,
        server: GET_IMAGE_DATA_URL,
        success: function(image) {
          console.log("getImageData :: Image received successfully.");
          console.log("  Source Dimensions: ", image.width, image.height);
          onImageLoaded(image.width, image.height, image);
        },
        error:   function(xhr, textStatus) {
          console.error("getImageData :: error", textStatus);
          if(textStatus !== 'parsererror') {
            // We had a problem.
            // Start over.
            didEncounterError = true;
            numFailures++;
            that.requestNextImage();
          }
        }
      });
    }

    // Handles a specific photo's size info.
    if(data.sizes) {
      // Try to get the large. If not the original.
      imageUrl = '';
      for(var i = data.sizes.size.length - 1; i >= 0; i--) {
        var size = data.sizes.size[i];
        if(size.label.toLowerCase() === 'original') {
          imageUrl = size.source;
        } else if(size.label.toLowerCase().indexOf('large') > -1) {
          // Make sure it's not a large square
          if(size.label.toLowerCase().indexOf('square') < 0) {
            imageUrl = size.source;
          }
        }
      }

      // Now that we have the image, we need to get the photo's info.
      this.requestPhotoInfo(flickrPhotoIds[currFlickrImageIndex]);
    }

  };

  /**

    Callback for the proxy load of the Flickr image data from the server.

  */
  function onImageLoaded(imgW, imgH, image) {
    console.log("App :: Image Loaded...");

    // Resize the image to fit within our size constraints.

    IMG_W = imgW;
    IMG_H = imgH;
    if(IMG_H > MAX_IMG_H) {
      IMG_H = MAX_IMG_H;
      IMG_W = Math.floor(IMG_H * imgW / imgH);
    } else if(IMG_W > MAX_IMG_W) {
      IMG_W = MAX_IMG_W;
      IMG_H = Math.floor(IMG_W * imgH / imgW);
    }
    // Scale the image up regardless.
    if(IMG_W < MAX_IMG_W && IMG_H < MAX_IMG_H) {
      if(IMG_H > IMG_W) {
        IMG_H = MAX_IMG_H;
        IMG_W = Math.floor(IMG_H * imgW / imgH);
      } else {
        IMG_W = MAX_IMG_W;
        IMG_H = Math.floor(IMG_W * imgH / imgW);
      }
    }

    imgCanvas.width = IMG_W;
    imgCanvas.height = IMG_H;
    canvas.width = IMG_W;
    canvas.height = IMG_H;

    // Now resize them with CSS so they fit on the screen comfortably.
    var maxCSSHeight = 720;
    var maxCSSWidth = 640;
    var cssW, cssH;

    if(IMG_W > IMG_H) {
      cssW = maxCSSWidth;
      cssH = Math.floor(cssW * IMG_H / IMG_W);
    } else {
      cssH = maxCSSHeight;
      cssW = Math.floor(cssH * IMG_W / IMG_H);
    }
    $canvases.css({
      width: cssW,
      height: cssH
    });

    // Finally draw the image to our source canvas.
    imgCtx.drawImage(image, 0, 0, IMG_W, IMG_H);

    // Set up the stroke lengths and widths based on sizes.
    MAX_STROKE_LENGTH = IMG_W < IMG_H ? IMG_W * STROKE_SCALE : IMG_H * STROKE_SCALE;

    that.start();
  }

  /**

    Kicks off the drawing phase of the app.

  */
  this.start = function() {
    console.log("App :: start()");

    isProcessingNewImage = false;
    lastData = undefined;

    // Setup our intervals and timeouts for refreshing and screen capping.
    setTimeout(this.initiateRefresh.bind(this), DRAW_DURATION);
    if(DO_SCREENSHOTS) {
      screenshotInterval = setInterval(this.grabScreenshot.bind(this), SCREENSHOT_INTERVAL_DURATION);
    }

    this.connectToSocket();
  };

  /**

    Starts a whole new image processing sequence.

  */
  this.initiateRefresh = function() {
    console.log("App :: initiateRefresh() ----------------");

    isProcessingNewImage = true;

    if(DO_SCREENSHOTS) {
      clearInterval(screenshotInterval);
    }

    if(DO_SAVE_IMAGE_ON_COMPLETION) {
      this.grabScreenshot( true );
    } else {
      this.requestNextImage();
    }
  };

  /**

    Grab a screenshot and send it to the server.

  */
  this.grabScreenshot = function( doRequestNextImage ) {
    console.log("App :: grabScreenshot()");

    doRequestNextImage = typeof doRequestNextImage === 'undefined' ? false : doRequestNextImage;

    var photoid = currFlickrPageResponse.photos.photo[currFlickrImageIndex].id;
    var dataUrl = canvas.toDataURL().split('data:image/png;base64,').join('');
    $.ajax({
      type: 'POST',
      url: SAVE_IMAGE_DATA_URL,
      data: {
        index: currFlickrImageIndex,
        data: dataUrl,
        photoid: 'p' + photoid,
        photopageurl: escape(photopageUrl),
        username: ownerUsername,
        realname: ownerName,
        nsid: ownerNSID
      },
      success: function() {
        if(doRequestNextImage) {
          that.requestNextImage();
        }
      }
    });
  };

  /**

    Connect to the uncontext socket.

  */
  this.connectToSocket = function() {
    if(isFirstStart) {
      isFirstStart = false;

      sock = new WebSocket('ws://duel.uncontext.com:80');

      sock.addEventListener('open', onConnect);
      sock.addEventListener('close', onSocketClose);
      sock.addEventListener('message', onData);
    }
  };

  function onConnect(event) {
    console.log('App :: socket connected.');
  }

  function onSocketClose(event) {
    console.log('App :: socket closed.');

    sock.removeEventListener('open', onConnect);
    sock.removeEventListener('close', onSocketClose);
    sock.removeEventListener('message', onData);
    sock = null;

    // Attempt reconnect after 30 seconds.
    isFirstStart = true;
    setTimeout(that.connectToSocket.bind(that), 30000);
  }

  /**

    Callback for uncontext socket's data feed.

  */
  function onData(event) {
    if( ! isProcessingNewImage) {
      /*
        {
          "a":[0.25,0.31], // scalar pair
          "b":[0.67,0.67], // scalar pair
          "c":0,    // bool (0, 1)
          "d":0.25, //scalar
          "e":0.22, //scalar
          "f":0.32  //scalar
        }
      */
      var data = JSON.parse(event.data);
      console.log(markCount + " :: ", data.a, data.b, data.d + ' | ' + data.e + ' | ' + data.f);

      // Check to see if this is our first time receiving data from uncontext.
      if(typeof lastData === 'undefined') {

        // It is, so we want to generate a new color scheme.
        var gradHexIndex = Math.floor(Math.random() * (gradHexes.length));

        console.log("New color scheme index", gradHexIndex);

        var gradHex = gradHexes[gradHexIndex];
        grad = new toxi.color.ColorGradient();
        for(var i = 0; i < gradHex.length; i++) {
          var hex = gradHex[i];
          var pos = Math.round((i / (gradHex.length-1)) * COLOR_RESOLUTION);
          grad.addColorAt( pos, toxi.color.TColor.newHex(hex) );
        }
        colors = grad.calcGradient(0, COLOR_RESOLUTION);

        // Flood fill the canvas.
        ctx.fillStyle = colorToRGBA( colors.get(0), 1.0 );
        ctx.fillRect(0, 0, canvas.width, canvas.height);

      } else {

        var mark = new Mark();
        mark.start.set(lastData.a[0] * IMG_W, lastData.a[1] * IMG_H);
        mark.last.set(mark.start);
        var tarX = data.a[0] * IMG_W + data.d * IMG_W;
        if(tarX > IMG_W) {
          tarX = tarX - IMG_W;
        }
        var tarY = data.a[1] * IMG_H + data.e * IMG_H;
        if(tarY > IMG_H) {
          tarY = tarY - IMG_H;
        }
        mark.target.set(tarX, tarY);

        // Figure out our length based on one of the scalars.
        var strokeLength = MAX_STROKE_LENGTH * data.f;
        // Create a line between our start and target.
        var line = new toxi.geom.Line2D( mark.start, mark.target );
        // Get the direction for our line and scale it to represent the true length of our stroke.
        var dir = line.getDirection();
        dir.scaleSelf(strokeLength);
        mark.dest.set(mark.start.x + dir.x, mark.start.y + dir.y);
        mark.vector.set(dir);
        mark.progress = 0;
        mark.width = MIN_STROKE_WIDTH + data.f * (MAX_STROKE_WIDTH - MIN_STROKE_WIDTH);
        mark.minAlpha = 0.10;
        mark.maxAlpha = mark.minAlpha + (1 - data.f) * 0.70;

        var dur = MIN_STROKE_DUR + (data.f * (MAX_STROKE_DUR - MIN_STROKE_DUR));
        marks[markCount + ''] = mark;
        TweenLite.to(marks[markCount + ''], dur, {
          progress: 1,
          ease: Quad.easeIn,
          onUpdate: onStrokeUpdate,
          onUpdateParams: [markCount + ''],
          onComplete: onStrokeComplete,
          onCompleteParams: [markCount + '']
        });
        markCount++;

        if(markCount == 0xFFFFFF) {
          // Make sure we don't go too high with our counting.
          markCount = 0;
        }
      }

      // Store this for next time.
      lastData = data;
    }
  }

  /**

    TweenLite stroke animation callback.

  */
  function onStrokeUpdate(markId) {
    var mark = marks[markId];
    // Here, we've got progress. We can use this to determine each part of our "step."
    var start = new toxi.geom.Vec2D();
    start.set(mark.last);
    var lengthScale = mark.progress - mark.lastProgress;
    // Scale the vector by the length scale, then add to start to get our end.
    var newLength = mark.vector.scale(lengthScale);
    var end = start.add(newLength);

    // Now we need to get color based on brightness of source image.
    var line = new toxi.geom.Line2D(start, end);
    var mid = line.getMidPoint();
    // Sample color based on this.
    var sample = imgCtx.getImageData(mid.x, mid.y, 1, 1);
    var sampleCol = toxi.color.TColor.newRGBA(sample.data[0]/255, sample.data[1]/255, sample.data[2]/255, sample.data[3]/255);
    var brt = sampleCol.brightness();
    // Map to our color range.
    var colIndex = Math.floor(brt * (COLOR_RESOLUTION - 1));
    var col = colors.get(colIndex);

    // Alpha opacity of stroke deteriorates as stroke's life increases... i.e. running out of paint.
    var alpha = mark.minAlpha + ((1-mark.progress) * (mark.maxAlpha - mark.minAlpha));

    // Let's construct some geometry for the stroke.
    var perp = mark.vector.getPerpendicular();
    var bl = new toxi.geom.Vec2D(start);
    var br = new toxi.geom.Vec2D(start);
    var tl = new toxi.geom.Vec2D(end);
    var tr = new toxi.geom.Vec2D(end);

    perp.normalize();
    perp.scaleSelf(mark.width);
    bl.addSelf(perp);
    perp.invert();
    br.addSelf(perp);

    tr.addSelf(perp);
    perp.invert();
    tl.addSelf(perp);

    ctx.beginPath();
    ctx.fillStyle = colorToRGBA(col, alpha);
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.lineTo(tl.x, tl.y);
    ctx.fill();

    mark.last.set(end);
    mark.lastProgress = mark.progress;
  }

  /**

    TweenLite callback for when stroke is done animating. We remove its reference.

  */
  function onStrokeComplete(markId) {
    var mark = marks[markId];
    marks[markId] = null;
    delete marks[markId];
  }

  /**

    Helper method for converting a TColor to an rgba() CSS String value.

  */
  function colorToRGBA(col, alpha) {
    var r = Math.round(col.red() * 255);
    var g = Math.round(col.green() * 255);
    var b = Math.round(col.blue() * 255);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
};

var app = new App(jQuery);

/**

  Flickr API JSONP callback method.

*/
function jsonFlickrApi(data) {
  app.handleFlickrResponse(data);
}

// Kick things off once the DOM has loaded.
jQuery(function($) {
  app.init();
});