/*jslint browser: true, devel: true, white: true, indent: 2, maxlen: 85,
nomen: true, plusplus: true, eqeq: true, sub: true */
(function (window) {
  "use strict";
  
  /**
   * @param {number} min
   * @param {number} max
   * @return {number}
   */
  function uniformRandom(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  /**
   * @param {number} n
   * @return {number}
   */
  function sign(n) {
    return n < 0 ? -1 : (n > 0 ? 1 : 0);
  }
  
  /**
   * @constructor
   */
  var Animation = function (options) {
    this._id = Animation._idCounter++;
    this._startTime = null;
    this._isRunning = false;
    this._isWaitingForDelay = false;
    this._values = {};
    
    // required arguments
    this._from = options.from;
    this._to = options.to;
    this._duration = options.duration;
    this._onUpdate = options.onUpdate;
    
    // optional arguments
    this._iterations = options["iterations"] || 1;
    this._delay = options["delay"] || 0;
    this._sticks = options["sticks"] === undefined ? true : !!options["sticks"];
    this._onAnimationStart = options["onAnimationStart"];
    this._onAnimationStartFired = false;
    this._onAnimationEnd = options["onAnimationEnd"];
    
    return this;
  };
  
  Animation._idCounter = 0;
  Animation._list = {};
  
  Animation.updateAll = function () {
    Object.keys(Animation._list).forEach(function (animationId) {
      Animation._list[animationId].update();
    });
  };
  
  Animation.stopAll = function () {
    Object.keys(Animation._list).forEach(function (animationId) {
      Animation._list[animationId].stop();
    });
  };
  
  Animation.prototype.start = function () {
    if (!this._isRunning) {
      this._onAnimationStartFired = false;
      if (this._onAnimationStart && !this._delay) {
        this._onAnimationStart.call(this._values);
        this._onAnimationStartFired = true;
      }
      Animation._list[this._id] = this;
      this._startTime = (new Date()).getTime();
      this._isRunning = true;
    }
  };
  
  Animation.prototype.stop = function () {
    this._startTime = null;
    this._isRunning = false;
    delete Animation._list[this._id];
    if (this._onAnimationEnd) {
      this._onAnimationEnd.call(this._values);
    }
  };
  
  Animation.prototype.update = function () {
    var that = this,
        timeDiff = (new Date()).getTime() - this._startTime,
        timePct,
        isAnimationEnd = false;
    
    if (timeDiff < this._delay) {
      this._isWaitingForDelay = true;
      return;
    }
    
    this._isWaitingForDelay = false;
    timeDiff -= this._delay;
    
    if (!this._isRunning || this._isWaitingForDelay) {
      return;
    }
    
    if (this._onAnimationStart && !this._isWaitingForDelay &&
        !this._onAnimationStartFired) {
      this._onAnimationStart.call(this._values);
      this._onAnimationStartFired = true;
    }
    
    timePct = timeDiff / this._duration;
    
    if (timeDiff > this._duration) {
      if (Math.floor(timePct) % 2 == 0) {
        timePct = timePct - Math.floor(timePct);
      } else {
        timePct = 1 - (timePct - Math.floor(timePct));
      }
    }
    
    if (timeDiff > this._duration * this._iterations) {
      if (this._sticks) {
        timePct = this._iterations % 2;
        isAnimationEnd = Boolean(this._onAnimationEnd);
      } else {
        this.stop();
        return;
      }
    }
    
    Object.keys(this._from).forEach(function (key) {
      var min = that._from[key], max = that._to[key];
      that._values[key] = min + timePct * (max - min);
    });
    
    this._onUpdate.call(this._values);
    
    if (isAnimationEnd) {
      this._onAnimationEnd.call(this._values);
    }
  };
  
  /**
   * @constructor
   */
  var AssetManager = function () {
    this._queue = [];
    this._cache = {};
    this._loadedCount = 0;
    this._callback = null;
    this.progress = 0;
  };
  
  AssetManager.prototype.queueDownload = function (path, type) {
    this._queue.push({path: path, type: type});
  };
  
  AssetManager.prototype.getAsset = function (path) {
    return this._cache[path];
  };
  
  AssetManager.prototype._onAssetLoad = function (path, asset) {
    this._cache[path] = asset;
    this._loadedCount++;
    this.progress = this._loadedCount / this._queue.length;
    if (this.progress == 1 && this._callback) {
      this._callback(this);
    }
  };
  
  AssetManager.prototype.downloadAll = function (callback) {
    var that = this;
    this._callback = callback;
    
    this._queue.forEach(function (file) {
      var asset, xhr;
      
      if (file.type == "image") {
        asset = new Image();
        asset.addEventListener("load", function () {
          that._onAssetLoad(file.path, asset);
        }, false);
        asset.src = file.path;
      } else if (file.type == "audio") {
        asset = document.createElement("audio");
        asset.preload = "auto";
        asset.addEventListener("loadeddata", function () {
          that._onAssetLoad(file.path, asset);
        }, false);
        asset.src = file.path;
      } else { // "json" or "text"
        xhr = new XMLHttpRequest();
        xhr.open("GET", file.path, true);
        
        xhr.onload = function () {
          asset = xhr.responseText;
          if (file.type == "json") {
            asset = JSON.parse(asset);
          }
          that._onAssetLoad(file.path, asset);
        };
        
        xhr.send();
      }
    });
  };
  
  /**
   * @constructor
   * @param {string} containerSelector
   * @param {number} width
   * @param {number} height
   */
  var FlappyBird = function (containerSelector, width, height) {
    /**
     * @enum {number}
     */
    this.State = {LOADING: 0, HOME: 1, START: 2, PLAYING: 3, GAMEOVER: 4};
    
    // state
    this.$container = document.querySelector(containerSelector);
    this.$canvas = document.createElement("canvas");
    this.$container.appendChild(this.$canvas);
    
    this.ctx = this.$canvas.getContext("2d");
    
    this.state = this.State.LOADING;
    
    this.t = null;
    this.dt = null;
    this.lastFrameTime = null;
    
    this.g = null;
    this.pipeScrollingSpeed = null;
    this.landScrollingSpeed = null;
    
    this.sprite = {};
    this.sounds = {};
    
    this.birdie = null;
    this.playButton = null;
    
    this.pipePairs = [];
    
    this.landTilesX = null;
    this.landTilesRequired = null;
    
    this.flapThisFrame = false;
    
    // constants
    this.DEFAULT_VOLUME = 0.1;
    this.G = 1200;
    this.FLAP_FORCE = 350;
    this.SCROLLING_SPEED = 135;
    
    this.LAND_WIDTH = 336;
    this.LAND_HEIGHT = 112;
    
    this.PIPE_WIDTH = 52;
    this.PIPE_HEIGHT = 320;
    this.PIPE_GAP = 98;
    this.PIPE_DISTANCE = 176;
    
    this.MAX_GAME_HEIGHT =
      this.LAND_HEIGHT + this.PIPE_HEIGHT + this.PIPE_GAP + 44;
    
    this.initialize(width, height);
  };
  
  /**
   * @param {number} width
   * @param {number} height
   */
  FlappyBird.prototype.initialize = function (width, height) {
    this.setCanvasSize(width, height);
    this.loadAssets(this.onAssetsLoaded.bind(this));
  };
  
  /**
   * @param {number} width
   * @param {number} height
   */
  FlappyBird.prototype.setCanvasSize = function (width, height) {
    height = Math.min(this.MAX_GAME_HEIGHT, height);
    
    this.$container.style.width = width + "px";
    this.$container.style.height = height + "px";
    this.$canvas.width = width;
    this.$canvas.height = height;
    
    // 44 = padding
    this.PIPE_MIN_MID = 44 + this.PIPE_GAP / 2;
    this.PIPE_MAX_MID = height - this.LAND_HEIGHT - this.PIPE_GAP / 2 - 44;
    
    this.pipePairsRequired = 1 + Math.ceil(this.$canvas.width / this.PIPE_DISTANCE);
    this.landTilesRequired = 1 + Math.ceil(this.$canvas.width / this.LAND_WIDTH);
  };
  
  FlappyBird.prototype.loadAssets = function (callback) {
    this.assetManager = new AssetManager();
    this.assetManager.queueDownload("/static/images/sprite.png", "image");
    this.assetManager.queueDownload("/static/scripts/sprite.json", "json");
    this.assetManager.downloadAll(callback);
  };
  
  FlappyBird.prototype.onAssetsLoaded = function (assetManager) {
    this.sprite.image = assetManager.getAsset("/static/images/sprite.png");
    this.sprite.data = assetManager.getAsset("/static/scripts/sprite.json");
    this.setUpAnimations();
    this.changeState(this.State.HOME);
    this.addEventListeners();
    this.update();
  };
  
  FlappyBird.prototype.setUpAnimations = function () {
    var that = this;
    
    this.animations = {};
    
    Object.keys(this.State).forEach(function (stateName) {
      that.animations[that.State[stateName]] = {};
    });
    
    this.animations[this.State.HOME].birdie = new Animation({
      from: {y: this.$canvas.height / 2 - this.sprite.data["bird0_0"].height / 2},
      to: {y: this.$canvas.height / 2 - this.sprite.data["bird0_0"].height},
      duration: 375,
      iterations: Infinity,
      sticks: false,
      /**
       * @this {Object}
       */
      onUpdate: function () {
        that.birdie.y = this.y;
      }
    });
    
    this.animations[this.State.START].birdie = new Animation({
      from: {y: this.$canvas.height / 2 - this.sprite.data["bird0_0"].height / 2},
      to: {y: this.$canvas.height / 2 - this.sprite.data["bird0_0"].height},
      duration: 375,
      iterations: Infinity,
      sticks: false,
      /**
       * @this {Object}
       */
      onUpdate: function () {
        that.birdie.y = this.y;
      }
    });
    
    this.animations[this.State.GAMEOVER].flash = new Animation({
      from: {opacity: 0},
      to: {opacity: 1},
      duration: 75,
      iterations: 2,
      sticks: false,
      /**
       * @this {Object}
       */
      onUpdate: function () {
        that.ctx.fillStyle = "rgba(255, 255, 255, " + this.opacity + ")";
        that.ctx.fillRect(0, 0, that.$canvas.width, that.$canvas.height);
      }
    });
    
    this.animations[this.State.GAMEOVER].shake = new Animation({
      from: {},
      to: {},
      duration: 750,
      sticks: false,
      /**
       * @this {Object}
       */
      onUpdate: function () {
        var style =
          "translate(" + uniformRandom(-2, 2) + "px, " +
          uniformRandom(-2, 2) + "px)";
        that.$canvas.style.mozTransform = style;
        that.$canvas.style.webkitTransform = style;
        that.$canvas.style.transform = style;
      },
      /**
       * @this {Object}
       */
      onAnimationEnd: function () {
        that.$canvas.style.mozTransform = "none";
        that.$canvas.style.webkitTransform = "none";
        that.$canvas.style.transform = "none";
      }
    });
    
    this.animations[this.State.GAMEOVER].gameOverText = new Animation({
      from: {opacity: 0},
      to: {opacity: 1},
      duration: 200,
      delay: 750,
      /**
       * @this {Object}
       */
      onUpdate: function () {
        that.ctx.globalAlpha = this.opacity;
        that.drawTile("text_game_over",
                       that.$canvas.width / 2 -
                       that.sprite.data["text_game_over"].width / 2,
                       that.$canvas.height - that.sprite.data["button_play"].height -
                       that.LAND_HEIGHT + 10 -
                       that.sprite.data["score_panel"].height - 15 -
                       that.sprite.data["text_game_over"].height - 5);
        that.ctx.globalAlpha = 1;
      },
      onAnimationStart: function () {
        that.displayScore = false;
      }
    });
    
    this.animations[this.State.GAMEOVER].scorePanel = new Animation({
      from: {y: this.$canvas.height},
      to: {
        y:
          this.$canvas.height - this.sprite.data["button_play"].height -
          this.LAND_HEIGHT + 10 - this.sprite.data["score_panel"].height - 15
      },
      duration: 200,
      delay: 1000,
      /**
       * @this {Object}
       */
      onUpdate: function () {
        that.drawTile(
          "score_panel",
          that.$canvas.width / 2 -
          that.sprite.data["score_panel"].width / 2,
          this.y);
      },
      /**
       * @this {Object}
       */
      onAnimationEnd: function () {
        if (that.medalId !== null) {
          that.drawTile(
            "medals_" + that.medalId,
            that.$canvas.width / 2 -
            that.sprite.data["text_game_over"].width / 2 + 15,
            this.y + 44);
        }
        that.drawNumber(
          that.$canvas.width / 2 -
          that.sprite.data["text_game_over"].width / 2 + 193,
          this.y + 36, that.score, "medium", "right");
        that.drawNumber(
          that.$canvas.width / 2 -
          that.sprite.data["text_game_over"].width / 2 + 193,
          this.y + 78, that.getHighScore(), "medium", "right");
        if (that.newHighScore) {
          that.drawTile(
            "new",
            that.$canvas.width / 2 -
            that.sprite.data["text_game_over"].width / 2 + 125,
            this.y + 60);
        }
        that.playButton.displayed = true;
      }
    });
  };
  
  /**
   * @param {number} state
   */
  FlappyBird.prototype.changeState = function (state) {
    var prevState = this.state, i;
    switch (state) {
      case this.State.HOME:
        this.changeBackground();
        
        this.landTilesX = [];
        this.landScrollingSpeed = this.SCROLLING_SPEED;
        
        this.playButton = {
          x: this.$canvas.width / 2 - this.sprite.data["button_play"].width / 2,
          y: this.$canvas.height - this.sprite.data["button_play"].height -
             this.LAND_HEIGHT + 10,
          displayed: true
        };
        
        this.birdie = {
          width: this.sprite.data["bird0_0"].width,
          height: this.sprite.data["bird0_0"].height,
          x: this.$canvas.width / 2 - this.sprite.data["bird0_0"].width / 2,
          y: this.$canvas.height / 2 - this.sprite.data["bird0_0"].height / 2,
          vy: 0,
          version: uniformRandom(0, 2),
          frame: 0,
          frameTime: 130,
          lastFrameTime: null,
          direction: 0,
          lastDirectionChangeTime: null,
          angle: 0
        };
        
        for (i = 0; i < this.landTilesRequired; i++) {
          this.landTilesX[i] = i * this.LAND_WIDTH;
        }
        
        break;
      case this.State.START:
        Animation.stopAll();
        
        this.playButton.displayed = false;
        
        if (prevState != this.State.HOME) {
          this.changeBackground();
        }
        
        this.landScrollingSpeed = this.SCROLLING_SPEED;
        
        this.displayScore = true;
        this.score = 0;
        this.newHighScore = false;
        this.medalId = null;
        
        this.birdie.x =
          this.$canvas.width / 4 - this.sprite.data["bird0_0"].width / 2;
        this.birdie.y =
          this.$canvas.height / 2 - this.sprite.data["bird0_0"].height / 2;
        this.birdie.frame = 0;
        this.birdie.frameTime = 130;
        this.birdie.lastFrameTime = null;
        this.birdie.direction = 0;
        this.birdie.lastDirectionChangeTime = null;
        this.birdie.angle = 0;
        
        if (prevState != this.State.START) {
          this.birdie.version = uniformRandom(0, 2);
        }
        
        for (i = 0; i < this.pipePairsRequired; i++) {
          this.pipePairs[i] = {
            // 200 = headstart
            x: 1.5 * this.$canvas.width + this.PIPE_WIDTH / 2 +
               this.PIPE_DISTANCE * i,
            my: uniformRandom(this.PIPE_MIN_MID, this.PIPE_MAX_MID)
          };
        }
        
        this.pipePairAheadId = 0;
        
        break;
      case this.State.PLAYING:
        this.animations[this.State.START].birdie.stop();
        this.g = this.G;
        this.pipeScrollingSpeed = this.SCROLLING_SPEED;
        this.landScrollingSpeed = this.SCROLLING_SPEED;
        this.birdie.frameTime = 60;
        break;
      case this.State.GAMEOVER:
        this.pipeScrollingSpeed = 0;
        this.landScrollingSpeed = 0;
        this.playButton.y =
          this.$canvas.height - this.sprite.data["button_play"].height -
          this.LAND_HEIGHT + 10;
        break;
      // default: // this.State.LOADING
        // ...
    }
    this.state = state;
    this.startStateAnimations();
  };
  
  FlappyBird.prototype.getSoundFilename = function (soundName) {
    var canPlayOgg = !!document.createElement("audio").canPlayType("audio/ogg"),
        extension = soundName != "wing" && canPlayOgg ? ".ogg" : ".mp3";
    return "sfx_" + soundName + extension;
  };
  
  FlappyBird.prototype.playSound = function (soundName) {
    var filename, sound, clonedSound;
    
    if (navigator.userAgent.match(/iPhone OS/)) {
      // Disable sound on iOS for now because it causes a *massive* fps drop
      return;
    }
    
    if (!this.sounds.hasOwnProperty(soundName)) {
      filename = this.getSoundFilename(soundName);
      sound = document.createElement("audio");
      sound.volume = this.DEFAULT_VOLUME;
      sound.addEventListener("loadeddata", function () {
        sound.play();
      }, false);
      sound.src = "/static/sounds/" + filename;
      this.sounds[soundName] = sound;
    } else {
      sound = this.sounds[soundName];
      if (sound.paused) {
        sound.currentTime = 0;
        sound.play();
      } else {
        clonedSound = sound.cloneNode(false);
        clonedSound.volume = this.DEFAULT_VOLUME;
        clonedSound.play();
      }
    }
  };
  
  FlappyBird.prototype.changeBackground = function () {
    var bgColorMapping = {"bg_day": "#4ec0ca", "bg_night": "#008793"},
        bgName = Object.keys(bgColorMapping)[uniformRandom(0, 1)],
        bgColor = bgColorMapping[bgName],
        scaledBy = this.$canvas.width / this.sprite.data[bgName].width,
        backgroundPositionX = -this.sprite.data[bgName].x * scaledBy,
        backgroundPositionY = 
          this.$canvas.height -
          this.sprite.data[bgName].height * scaledBy *
          (1 - this.LAND_HEIGHT / this.sprite.data[bgName].height) -
          this.LAND_HEIGHT;
    
    if (!this.$canvas.style.backgroundImage) {
      this.$canvas.style.backgroundImage = "url(/static/images/sprite.png)";
    }
    
    this.$canvas.style.backgroundRepeat = "no-repeat";
    this.$canvas.style.backgroundColor = bgColor;
    this.$canvas.style.backgroundPosition =
      backgroundPositionX + "px " +
      backgroundPositionY + "px";
    this.$canvas.style.backgroundSize =
      (this.sprite.image.width * scaledBy) + "px " +
      (this.sprite.image.height * scaledBy) + "px";
  };
  
  FlappyBird.prototype.startStateAnimations = function () {
    var stateAnimations = this.animations[this.state];
    Object.keys(stateAnimations).forEach(function (name) {
      stateAnimations[name].start();
    });
  };
  
  /**
   * @return {number}
   */
  FlappyBird.prototype.getHighScore = function () {
    return parseInt(window.localStorage.getItem("highScore"), 10) || 0;
  };
  
  /**
   * @param {number} highScore
   */
  FlappyBird.prototype.setHighScore = function (highScore) {
    window.localStorage.setItem("highScore", highScore.toString());
  };
  
  FlappyBird.prototype.addEventListeners = function () {
    document.addEventListener("mousedown", this.onUIEvent.bind(this), false);
    document.addEventListener("mouseup", this.onUIEvent.bind(this), false);
    document.addEventListener("keyup", this.onUIEvent.bind(this), false);
    document.addEventListener("keydown", this.onUIEvent.bind(this), false);
    document.addEventListener("touchstart", this.onUIEvent.bind(this), false);
    document.addEventListener("touchend", this.onUIEvent.bind(this), false);
  };
  
  /**
   * @param {Object} e
   * @return {Object}
   */
  FlappyBird.prototype.getAbstractUIEvent = function (e) {
    var type, moment, data = {};
    
    if (["mousedown", "touchstart", "keydown"].indexOf(e.type) != -1) {
      moment = "start";
    } else if (["mouseup", "touchend", "keyup"].indexOf(e.type) != -1) {
      moment = "end";
    } else {
      return null;
    }
    
    if (["keydown", "keyup"].indexOf(e.type) != -1) {
      type = "keyboard";
    } else {
      type = "mousetouch";
    }
    
    if (type == "mousetouch") {
      type = "mousetouch";
      if (e.type == "touchend") {
        data.coords = {
          x: e.changedTouches[0].clientX,
          y: e.changedTouches[0].clientY
        };
      } else {
        data.coords = {
          x: e.layerX,
          y: e.layerY
        };
      }
    } else {
      type = "keyboard";
      data.keyCode = e.keyCode;
    }
    
    return {type: type, moment: moment, data: data};
  };
  
  /**
   * @param {Object} e
   */
  FlappyBird.prototype.onUIEvent = function (e) {
    var ae = this.getAbstractUIEvent(e),
        x, y;
    
    if ((ae.type == "mousetouch" && e.target != this.$canvas) ||
        (ae.type == "keyboard" && [13, 32, 38, 87].indexOf(ae.data.keyCode) == -1)) {
      return;
    }
    
    if (ae.type == "mousetouch") {
      x = ae.data.coords.x;
      y = ae.data.coords.y;
    }
    
    if (this.playButton.displayed) {
      if (ae.type == "keyboard" ||
          (ae.type == "mousetouch" &&
           x >= this.playButton.x &&
           x <= this.playButton.x + this.sprite.data["button_play"].width &&
           y >= this.playButton.y &&
           y <= this.playButton.y + this.sprite.data["button_play"].height)) {
        if (ae.moment == "start") {
          // button press
          this.playButton.y += 2;
          e.preventDefault();
        } else {
          // button release
          this.playButton.y -= 2;
          this.playButton.displayed = false;
          this.playSound("swooshing");
          this.changeState(this.State.START);
          e.preventDefault();
        }
      }
    } else if (ae.moment == "start") {
      // action
      if ([this.State.START, this.State.PLAYING].indexOf(this.state) != -1 &&
          this.birdie.y >= 0) {
        this.playSound("wing");
        this.flapThisFrame = true;
      }
      if (this.state == this.State.START) {
        this.changeState(this.State.PLAYING);
      }
      e.preventDefault();
    }
    
    // // ----------------------------------------------------------------------
    
    // if (ae.data.coords) { // mouse/touch event
    //   var x = ae.data.coords.x,
    //       y = ae.data.coords.y;
    //   if (this.playButton.displayed) {
    //     if (x >= this.playButton.x &&
    //         x <= this.playButton.x + this.sprite.data["button_play"].width &&
    //         y >= this.playButton.y &&
    //         y <= this.playButton.y + this.sprite.data["button_play"].height) {
    //       if (ae.type == "start") {
    //         this.playButton.y += 2;
    //         e.preventDefault();
    //       } else {
    //         this.playButton.y -= 2;
    //         this.playButton.displayed = false;
    //         this.playSound("swooshing");
    //         this.changeState(this.State.START);
    //         e.preventDefault();
    //       }
    //     }
    //   } else if (ae.type == "start") {
    //     if ([this.State.START, this.State.PLAYING].indexOf(this.state) != -1 &&
    //         this.birdie.y >= 0) {
    //       this.playSound("wing");
    //       this.flapThisFrame = true;
    //     }
    //     if (this.state == this.State.START) {
    //       this.changeState(this.State.PLAYING);
    //     }
    //     e.preventDefault();
    //   }
    // } else { // keyboard event
    //   // [enter, space, up, "w"]
    //   if ([13, 32, 38, 87].indexOf(ae.data.keyCode) != -1) {
    //     if (this.playButton.displayed) {
    //       if (ae.type == "start") {
    //         this.playButton.y += 2;
    //         e.preventDefault();
    //       } else {
    //         this.playButton.y -= 2;
    //         this.playSound("swooshing");
    //         this.changeState(this.State.START);
    //         e.preventDefault();
    //       }
    //     } else if (ae.type == "start") {
    //       if ([this.State.START, this.State.PLAYING].indexOf(this.state) != -1 &&
    //           this.birdie.y >= 0) {
    //         this.playSound("wing");
    //         this.flapThisFrame = true;
    //       }
    //       if (this.state == this.State.START) {
    //         this.changeState(this.State.PLAYING);
    //       }
    //       e.preventDefault();
    //     }
    //   }
    // }
  };
  
  FlappyBird.prototype.updateBirdieAngle = function () {
    if (this.birdie.lastDirectionChangeTime === null) {
      return;
    }
    
    if (this.birdie.direction >= 0) {
      this.birdie.angle -= this.birdie.vy * 2 * this.dt;
      this.birdie.angle = Math.max(-20, this.birdie.angle);
    } else {
      this.birdie.angle -= this.birdie.vy / 2 * this.dt;
      this.birdie.angle = Math.min(90, this.birdie.angle);
    }
  };
  
  FlappyBird.prototype.updateLand = function () {
    var that = this;
    this.landTilesX.forEach(function (tileX, i, arr) {
      if (tileX + that.LAND_WIDTH <= 0) {
        arr[i] = Math.max.apply(Math, arr) + that.LAND_WIDTH;
      }
      arr[i] -= that.landScrollingSpeed * that.dt;
    });
  };
  
  FlappyBird.prototype.updateBirdie = function () {
    var prevDirection = this.birdie.direction;
    
    if (this.state > this.State.START) {
      if (this.flapThisFrame) {
        this.birdie.vy = this.FLAP_FORCE;
        this.birdie.direction = 1;
      } else {
        this.birdie.vy -= this.g * this.dt;
        this.birdie.direction = sign(this.birdie.vy);
      }
      
      if (this.birdie.direction != prevDirection) {
        this.birdie.lastDirectionChangeTime = this.t;
      }
      
      this.birdie.y -= this.birdie.vy * this.dt;
      this.birdie.y =
        Math.min(
          this.$canvas.height - this.birdie.height -
          this.sprite.data["land"].height,
          this.birdie.y);
      
      this.updateBirdieAngle();
    }
    
    if (this.state == this.State.GAMEOVER) {
      this.birdie.frame = 1;
    } else {
      if (this.birdie.lastFrameTime === null) {
        this.birdie.frame = 0;
        this.birdie.lastFrameTime = this.t;
      } else {
        if (this.t - this.birdie.lastFrameTime > this.birdie.frameTime) {
          this.birdie.frame++;
          if (this.birdie.frame == 3) {
            this.birdie.frame = 0;
          }
          this.birdie.lastFrameTime = this.t;
        }
      }
    }
  };
  
  /**
   * @return {Object.<string, number>}
   */
  FlappyBird.prototype.getBirdieBoundingBox = function () {
    return {
      x: this.birdie.x + 4,
      y: this.birdie.y,
      width: this.birdie.width - 10,
      height: this.birdie.height
    };
  };
  
  FlappyBird.prototype.updateScore = function () {
    if (this.getBirdieBoundingBox().x >=
        this.pipePairs[this.pipePairAheadId].x - this.PIPE_WIDTH / 2) {
      this.playSound("point");
      this.score++;
      this.pipePairAheadId++;
      if (this.pipePairAheadId == this.pipePairs.length) {
        this.pipePairAheadId = 0;
      }
    }
  };
  
  FlappyBird.prototype.updatePipePairs = function () {
    var that = this;
    this.pipePairs.forEach(function (pipePair, i, arr) {
      arr[i].x -= that.pipeScrollingSpeed * that.dt;
      if (pipePair.x + that.PIPE_WIDTH / 2 <= 0) {
        arr[i].x = arr[i > 0 ? i - 1 : arr.length - 1].x + that.PIPE_DISTANCE;
        arr[i].my = uniformRandom(that.PIPE_MIN_MID, that.PIPE_MAX_MID);
      }
    });
  };
  
  FlappyBird.prototype.update = function () {
    this.t = (new Date()).getTime();
    if (this.lastFrameTime === null) {
      this.lastFrameTime = this.t;
    }
    this.dt = (this.t - this.lastFrameTime) / 1000;
    // this.dt = 1 / 60;
    
    this.updateLand();
    this.updateBirdie();
    
    if (this.state >= this.State.START) {
      this.updatePipePairs();
      this.updateScore();
    }
    
    this.checkBirdieCollision();
    this.draw();
    
    this.flapThisFrame = false;
    this.lastFrameTime = this.t;
    
    window.requestAnimationFrame(this.update.bind(this));
  };
  
  FlappyBird.prototype.checkBirdieCollision = function () {
    if (this.isBirdieColliding()) {
      this.handleBirdieCollision();
    }
  };
  
  /**
   * @return {boolean}
   */
  FlappyBird.prototype.isBirdieColliding = function () {
    var birdieBoundingBox = this.getBirdieBoundingBox(),
        i, pipeData;
    
    // land
    if (birdieBoundingBox.y + birdieBoundingBox.height >=
        this.$canvas.height - this.sprite.data["land"].height) {
      return true;
    }
    
    // pipes
    for (i = 0; i < this.pipePairs.length; i++) {
      pipeData = this.getPipeData(this.pipePairs[i]);
      if (this.collide(birdieBoundingBox, pipeData.down) ||
          this.collide(birdieBoundingBox, pipeData.up)) {
        return true;
      }
    }
    
    return false;
  };
  
  /**
   * @param {Object} a
   * @param {Object} b
   * @return {boolean}
   */
  FlappyBird.prototype.collide = function (a, b) {
    return a.x <= b.x + b.width &&
           b.x <= a.x + a.width &&
           a.y <= b.y + b.height &&
           b.y <= a.y + a.height;
  };
  
  FlappyBird.prototype.onGameOver = function () {
    var that = this;
    
    this.playSound("hit");
    setTimeout(function() {
      that.playSound("die");
    }, 250);
    
    if (this.score > this.getHighScore()) {
      this.setHighScore(this.score);
      this.newHighScore = true;
    }
    
    if (this.score >= 40) {
      this.medalId = 0;
    } else if (this.score >= 30) {
      this.medalId = 1;
    } else if (this.score >= 20) {
      this.medalId = 2;
    } else if (this.score >= 10) {
      this.medalId = 3;
    }
    
    this.changeState(this.State.GAMEOVER);
  };
  
  FlappyBird.prototype.handleBirdieCollision = function () {
    if (this.state != this.State.GAMEOVER) {
      this.onGameOver();
    }
  };
  
  /**
   * @param {string} tileName
   * @param {number} dx
   * @param {number} dy
   * @param {number=} scale
   */
  FlappyBird.prototype.drawTile = function (tileName, dx, dy, scale) {
    var tile = this.sprite.data[tileName];
    this.ctx.drawImage(
      this.sprite.image, tile.x, tile.y, tile.width, tile.height, dx, dy,
      tile.width * (scale || 1), tile.height * (scale || 1));
    // // debug
    // this.ctx.strokeStyle = "red";
    // this.ctx.lineWidth = 1;
    // this.ctx.strokeRect(dx, dy, tile.width, tile.height);
  };
  
  /**
   * @param {string} tileName
   * @param {number} dx
   * @param {number} dy
   * @param {number=} angle
   */
  FlappyBird.prototype.drawRotatedTile = function (tileName, dx, dy, angle) {
    var tile = this.sprite.data[tileName];
    this.ctx.save();
    this.ctx.translate(dx + tile.width / 2, dy + tile.height / 2);
    this.ctx.rotate(angle * Math.PI / 180);
    this.drawTile(tileName, -tile.width / 2, -tile.height / 2);
    this.ctx.restore();
  };
  
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} number
   * @param {string} size
   * @param {string} align
   */
  FlappyBird.prototype.drawNumber = function (x, y, number, size, align) {
    var numberStr = number.toString(),
        numberWidth = 0,
        offset = 0,
        tileFirstId = size == "large" ? 48 : 0,
        i, startX, digitWidth, digitKey, tilePrefix;
    
    switch (size) {
      case "large": tilePrefix = "font_0"; break;
      default: tilePrefix = "number_score_0";
    }
    
    for (i = 0; i < numberStr.length; i++) {
      digitWidth = this.sprite.data[tilePrefix + (tileFirstId + i)].width;
      numberWidth += size == "large" ? digitWidth - 4 : digitWidth;
    }
    
    switch (align) {
      case "center": startX = x - numberWidth / 2; break;
      case "right": startX = x - numberWidth; break;
      default: startX = x;
    }
    
    for (i = 0; i < numberStr.length; i++) {
      digitKey = tilePrefix + (tileFirstId + parseInt(numberStr[i], 10));
      digitWidth = this.sprite.data[digitKey].width;
      this.drawTile(digitKey, startX + offset, y);
      offset += size == "large" ? digitWidth - 4 : digitWidth;
    }
  };
  
  FlappyBird.prototype.drawBirdie = function () {
    this.drawRotatedTile(
      "bird" + this.birdie.version + "_" + this.birdie.frame,
      this.birdie.x, this.birdie.y, this.birdie.angle);
  };
  
  FlappyBird.prototype.draw = function () {
    var that = this;
    
    this.ctx.clearRect(0, 0, this.$canvas.width, this.$canvas.height);
    
    if (this.state == this.State.HOME) {
      this.drawTile(
        "title", this.$canvas.width / 2 - this.sprite.data["title"].width / 2,
        this.$canvas.height / 2 - 90);
    }
    
    if (this.state >= this.State.START) {
      this.drawPipes();
      
      if (this.displayScore) {
        // score
        this.drawNumber(
          this.$canvas.width / 2,
          this.$canvas.height / 5 - this.sprite.data["font_048"].width,
          this.score, "large", "center");
      }
    }
    
    // bird
    this.drawBirdie();
    
    // land
    this.landTilesX.forEach(function (tileX) {
      that.drawTile(
        "land", tileX, that.$canvas.height - that.sprite.data["land"].height);
    });
    
    if (this.playButton.displayed) {
      this.drawTile("button_play", this.playButton.x, this.playButton.y);
    }
    
    Animation.updateAll();
  };
  
  /**
   * @param {Object} pipe
   * @return {Object}
   */
  FlappyBird.prototype.getPipeData = function (pipe) {
    return {
      down: {
        x: pipe.x - this.PIPE_WIDTH / 2,
        y: pipe.my - this.sprite.data["pipe_down"].height - this.PIPE_GAP / 2,
        width: this.sprite.data["pipe_down"].width,
        height: this.sprite.data["pipe_down"].height
      },
      up: {
        x: pipe.x - this.PIPE_WIDTH / 2,
        y: pipe.my + this.PIPE_GAP / 2,
        width: this.sprite.data["pipe_up"].width,
        height: this.sprite.data["pipe_up"].height
      }
    };
  };
  
  FlappyBird.prototype.drawPipes = function () {
    var that = this;
    this.pipePairs.map(this.getPipeData.bind(this)).forEach(function(pipeData) {
      that.drawTile("pipe_down", pipeData.down.x, pipeData.down.y);
      that.drawTile("pipe_up", pipeData.up.x, pipeData.up.y);
      // // debug
      // that.ctx.fillRect(pipe.x-2.5, pipe.my-2.5, 5, 5);
    });
  };
  
  var width, height, game;
  
  if (window.innerWidth < 480) {
    width = window.innerWidth;
    height = window.innerHeight;
  } else {
    width = 640;
    height = 480;
  }
  
  game = new FlappyBird("#flappy-bird", width, height);
}(window));
