var musika = {};


// -----------------------------------------------------------------------------
// musika.Game
// -----------------------------------------------------------------------------

/**
 * @param {Object} canvas The canvas element.
 * @param {Array.<Object>} taps The chronological list of taps.
 * @param {string} musicUrl The path of the song to play.
 * @param {Array.<number>} amps The amplitude of the song sampled 60 times a second.
 * @param {Array.<number>} beats The timestamps of the beats of the song.
 * @constructor
 */
musika.Game = function(canvas, taps, musicUrl, amps, beats) {

  // Setup canvas.
  this.canvas_ = canvas;
  this.ctx_ = this.canvas_.getContext('2d');
  this.canvas_.width = window.innerWidth;
  this.canvas_.height = window.innerHeight;

  this.taps_ = taps;
  this.processTaps_();
  this.musicUrl_ = musicUrl;
  this.amps_ = amps;
  this.beats_ = beats;
  this.music_ = undefined;
  this.lastMusicPosition_ = -1;
  this.lastMusicPositionUpdateTime_ = -1;
  this.tapPosition_ = 0;
  this.score_ = 0;
  this.chain_ = 0;
  this.chainNext_ = 0;
  this.maxChain_ = 0;

  this.world_ = this.createWorld();

  // Create walls.
  var physicsHeight = this.canvas_.height * musika.Game.PHYSICS_SCALE / this.canvas_.width;
  var physicsWidth = musika.Game.PHYSICS_SCALE;
  this.createBox(-10, physicsHeight / 2, 10, physicsHeight);
  this.createBox(physicsWidth + 10, physicsHeight / 2, 10, physicsHeight);
};


musika.Game.SETUP_TIME = 2000;
musika.Game.HOLD_TIME = 500;
musika.Game.TAP_DURATION = musika.Game.SETUP_TIME + musika.Game.HOLD_TIME;
musika.Game.RING_RADIUS = 400;
musika.Game.TAP_RADIUS = musika.Game.HOLD_TIME * musika.Game.RING_RADIUS / musika.Game.TAP_DURATION;
musika.Game.TAP_X_SCALE = 960;
musika.Game.TAP_Y_SCALE = 640;

musika.Game.PHYSICS_SCALE = 80;
musika.Game.PHYSICS_BOUNDS = 100;


musika.Game.prototype.start = function() {
  this.music_ = soundManager.createSound({id: 'music', url: this.musicUrl_});
  this.music_.play();

  // Mouse listeners.
  this.canvas_.addEventListener('mousedown', this.onMouseDown_.bind(this));
  this.canvas_.addEventListener('mousemove', this.onMouseMove_.bind(this));
  this.canvas_.addEventListener('mouseup', this.onMouseUp_.bind(this));

  // Needed for iPad, iPhone.
  this.canvas_.addEventListener('touchstart', this.onMouseDown_.bind(this));
  this.canvas_.addEventListener('touchmove', this.onMouseMove_.bind(this));
  this.canvas_.addEventListener('touchend', this.onMouseUp_.bind(this));

  this.requestAnimationFrame_(this.step_.bind(this));
};


// -----------------------------------------------------------------------------
// Advances and draws the game.
// -----------------------------------------------------------------------------


musika.Game.prototype.step_ = function() {
  // Sync to the current music time.
  var time = this.getTime_();

  if (this.music_ && this.music_.duration &&
      time >= this.music_.duration) {
    this.ctx_.fillStyle = 'rgba(0,0,0,1)';
    this.ctx_.fillRect(0, 0, this.canvas_.width, this.canvas_.height);
    this.drawGameOverScreen_();
    return;
  }

  // Amp calculation.
  /*
  var ampIndex = Math.floor(time * 60 / 1000);
  var amp = 0.5;
  if (ampIndex > 0 && ampIndex < this.amps_.length) {
    amp = this.amps_[ampIndex];
  }
  amp = Math.abs(amp - 0.5) * 20;
  if (amp > 1) {
    amp = 1;
  }
  */

  // Beat calculation.
  var closestBeat = Infinity;
  for (var j = 0; j < this.beats_.length; j++) {
    var beatDistance = Math.abs(time - this.beats_[j]) / 100;
    if (beatDistance < closestBeat) {
      closestBeat = beatDistance;
    }
  }
  closestBeat = 1 - closestBeat;
  if (closestBeat < 0 ) {
    closestBeat = 0;
  }

  // Clear canvas.
  //this.ctx_.fillStyle = 'rgba(0,0,0,1)';
  this.ctx_.fillStyle = this.getInterpolatedColor_(closestBeat, 0, 0, 0, 0.1, 255, 255, 255, 1);
  this.ctx_.fillRect(0, 0, this.canvas_.width, this.canvas_.height);

  // Step physics.
  this.world_.Step(
      1.0/60, // time step
      10, // velocity iterations
      3); // position iterations

  // Draw physics.
  this.drawWorld_(this.world_, this.ctx_);

  // Clean up physics.
  for (var b = this.world_.m_bodyList; b; b = b.m_next) {
    // Clear the shapes that are out of bounds.
    if (b.m_position.y <= -musika.Game.PHYSICS_BOUNDS ||
        b.m_position.y >= musika.Game.PHYSICS_BOUNDS  ||
        b.m_position.x <= -musika.Game.PHYSICS_BOUNDS ||
        b.m_position.x >= musika.Game.PHYSICS_BOUNDS) {
      this.world_.DestroyBody(b);
    }
  }

  // Loop through the taps that have elapsed.
  while (this.tapPosition_ < this.taps_.length) {
    var tap = this.taps_[this.tapPosition_];
    if (tap.time + musika.Game.HOLD_TIME < time) {
      // Do something with the tap that elapsed.
      console.log('tap elapsed, position: ' + this.tapPosition_);
      if (!tap.hit) {
        // Missed!
        this.chain_ = 0;
        this.chainNext_ = -1;
      }
      this.tapPosition_++;
    } else {
      break;
    }
  }

  // Loop through the taps that are being displayed.
  var displayedTaps = [];
  for (var i = this.tapPosition_; i < this.taps_.length; i++) {
    tap = this.taps_[i];
    if (tap.time - musika.Game.SETUP_TIME < time &&
        tap.time + musika.Game.HOLD_TIME > time) {
      if (!tap.hit) {
        displayedTaps.push(tap);
      }
    } else {
      break;
    }
  }

  for (i = 0; i < displayedTaps.length; i++) {
    this.drawTap_(displayedTaps[i], time);
  }
  for (i = 0; i < displayedTaps.length; i++) {
    this.drawRing_(displayedTaps[i], time);
  }

  this.drawScore_();

  this.requestAnimationFrame_(this.step_.bind(this));
};


musika.Game.prototype.getTime_ = function() {
  // Sync to the current music time.
  var time = this.music_.position;
  if (time == this.lastMusicPosition_) {
    time = this.lastMusicPosition_ + new Date().getTime() - this.lastMusicPositionUpdateTime_;
  } else if (time > 0) {
    this.lastMusicPosition_ = time;
    this.lastMusicPositionUpdateTime_ = new Date().getTime();
  }
  return time;
};


// Taken from:
// http://paulirish.com/2011/requestanimationframe-for-smart-animating/
musika.Game.prototype.requestAnimationFrame_ = function(callback) {
  var fn = window.requestAnimationFrame       || 
           window.webkitRequestAnimationFrame || 
           window.mozRequestAnimationFrame    || 
           window.oRequestAnimationFrame      || 
           window.msRequestAnimationFrame     || 
           function(callback) {
             window.setTimeout(callback, 1000 / 60);
           };
  fn(callback);
};


// -----------------------------------------------------------------------------
// Draw Methods
// -----------------------------------------------------------------------------


musika.Game.prototype.drawWorld_ = function(world, context) {
  context.save();
  context.scale(
    this.canvas_.width / musika.Game.PHYSICS_SCALE,
    this.canvas_.width / musika.Game.PHYSICS_SCALE);

  // Draw joints.
  for (var j = world.m_jointList; j; j = j.m_next) {
    this.drawJoint_(j, context);
  }

  // Draw body shapes.
  for (var b = world.m_bodyList; b; b = b.m_next) {
    for (var s = b.GetShapeList(); s != null; s = s.GetNext()) {
      this.drawShape_(s, context);
    }
  }

  context.restore();
};


musika.Game.prototype.drawJoint_ = function(joint, context) {
  var b1 = joint.m_body1;
  var b2 = joint.m_body2;
  var x1 = b1.m_position;
  var x2 = b2.m_position;
  var p1 = joint.GetAnchor1();
  var p2 = joint.GetAnchor2();
  context.lineWidth = 0.2;
  context.strokeStyle = '#00eeee';
  context.beginPath();
  switch (joint.m_type) {
  case b2Joint.e_distanceJoint:
    context.moveTo(p1.x, p1.y);
    context.lineTo(p2.x, p2.y);
    break;

  case b2Joint.e_pulleyJoint:
    // TODO
    break;

  default:
    if (b1 == world.m_groundBody) {
      context.moveTo(p1.x, p1.y);
      context.lineTo(x2.x, x2.y);
    }
    else if (b2 == world.m_groundBody) {
      context.moveTo(p1.x, p1.y);
      context.lineTo(x1.x, x1.y);
    }
    else {
      context.moveTo(x1.x, x1.y);
      context.lineTo(p1.x, p1.y);
      context.lineTo(x2.x, x2.y);
      context.lineTo(p2.x, p2.y);
    }
    break;
  }
  context.stroke();
};


musika.Game.prototype.drawShape_ = function(shape, context, opt_stroke) {
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  switch (shape.m_type) {
  case b2Shape.e_circleShape:
    {
      var circle = shape;
      var pos = circle.m_position;
      var r = circle.m_radius;
      var segments = 16.0;
      var theta = 0.0;
      var dtheta = 2.0 * Math.PI / segments;

      // draw circle
      context.moveTo(pos.x + r, pos.y);
      for (var i = 0; i < segments; i++) {
        var d = new b2Vec2(r * Math.cos(theta), r * Math.sin(theta));
        var v = b2Math.AddVV(pos, d);
        context.lineTo(v.x, v.y);
        theta += dtheta;
      }
      context.lineTo(pos.x + r, pos.y);
  
      // draw radius
      context.moveTo(pos.x, pos.y);
      var ax = circle.m_R.col1;
      var pos2 = new b2Vec2(pos.x + r * ax.x, pos.y + r * ax.y);
      context.lineTo(pos2.x, pos2.y);

      // Paint settings.
      context.fillStyle = '#FFF';
      context.strokeStyle = '#FFF';
    }
    break;
  case b2Shape.e_polyShape:
    {
      var poly = shape;
      var tV = b2Math.AddVV(poly.m_position, b2Math.b2MulMV(poly.m_R, poly.m_vertices[0]));
      context.moveTo(tV.x, tV.y);
      for (var i = 0; i < poly.m_vertexCount; i++) {
        var v = b2Math.AddVV(poly.m_position, b2Math.b2MulMV(poly.m_R, poly.m_vertices[i]));
        context.lineTo(v.x, v.y);
      }
      context.lineTo(tV.x, tV.y);

      // Paint settings.
      context.fillStyle = poly.GetBody().color;
      context.strokeStyle = '#FFF';
    }
    break;
  }

  context.fill();
  if (opt_stroke) {
    context.stroke();
  }
};


musika.Game.TIMING_COLORS = [
  {'timing':0, 'r':0, 'g':0, 'b':255, 'a':1},
  {'timing':100, 'r':0, 'g':255, 'b':255, 'a':1},
  {'timing':200, 'r':0, 'g':255, 'b':0, 'a':1},
  {'timing':300, 'r':255, 'g':255, 'b':0, 'a':1},
  {'timing':400, 'r':255, 'g':0, 'b':0, 'a':1},
  {'timing':2000, 'r':255, 'g':0, 'b':0, 'a':0},
];


musika.Game.prototype.getTimingColor_ = function(index) {
  return musika.Game.TIMING_COLORS[index % musika.Game.TIMING_COLORS.length];
};


musika.Game.prototype.getTimingColor_ = function(timing) {
  for (var i = 0; i < musika.Game.TIMING_COLORS.length - 1; i++) {
    var tc1 = musika.Game.TIMING_COLORS[i];
    var tc2 = musika.Game.TIMING_COLORS[i + 1];
    if (timing >= tc1.timing && timing < tc2.timing) {
      return this.getInterpolatedColor_(
          (timing - tc1.timing) / (tc2.timing - tc1.timing),
          tc1.r, tc1.g, tc1.b, tc1.a,
          tc2.r, tc2.g, tc2.b, tc2.a);
    }
  }
  var tc = musika.Game.TIMING_COLORS[musika.Game.TIMING_COLORS.length - 1];
  return this.color_(tc.r, tc.g, tc.b, tc.a);
};


musika.Game.prototype.getInterpolatedColor_ = function(int, r1, g1, b1, a1, r2, g2, b2, a2) {
  var interpolate = function(int, v1, v2) {
    return v1 + int * (v2 - v1);
  }
  return this.color_(
      Math.floor(interpolate(int, r1, r2)),
      Math.floor(interpolate(int, g1, g2)),
      Math.floor(interpolate(int, b1, b2)),
      interpolate(int, a1, a2));
};


musika.Game.prototype.color_ = function(r, g, b, a) {
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
};


musika.Game.prototype.drawTap_ = function(tap, time) {
  var timing = Math.abs(time - tap.time);
  var ctx = this.ctx_;
  ctx.save();
  ctx.translate(
      tap.x * this.canvas_.width / musika.Game.TAP_X_SCALE,
      tap.y * this.canvas_.height / musika.Game.TAP_Y_SCALE);

  var alpha = (time - tap.time + musika.Game.SETUP_TIME) / (musika.Game.SETUP_TIME / 2);
  if (alpha > 1) alpha = 1;

  var ringRadius = (tap.time + musika.Game.HOLD_TIME - time) * musika.Game.RING_RADIUS / musika.Game.TAP_DURATION;
  var radius = musika.Game.TAP_RADIUS;
  if (ringRadius < radius) {
    radius = ringRadius;
  }

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, 2*Math.PI);
  ctx.fillStyle = tap.color + alpha + ')';
  ctx.fill();

  ctx.fillStyle = '#FFF';
  ctx.font = '48px Courier';
  var msg = tap.cat;
  var textWidth = ctx.measureText(msg).width;
  ctx.fillText(msg, -textWidth / 2, 12);

  ctx.restore();
};


musika.Game.prototype.drawRing_ = function(tap, time) {
  var timing = Math.abs(time - tap.time);
  var ctx = this.ctx_;
  ctx.save();
  ctx.translate(
      tap.x * this.canvas_.width / musika.Game.TAP_X_SCALE,
      tap.y * this.canvas_.height / musika.Game.TAP_Y_SCALE);

  var ringRadius = (tap.time + musika.Game.HOLD_TIME - time) * musika.Game.RING_RADIUS / musika.Game.TAP_DURATION;

  ctx.beginPath();
  ctx.arc(0, 0, ringRadius, 0, 2*Math.PI);
  ctx.strokeStyle = this.getTimingColor_(timing);
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.restore();
};


musika.Game.prototype.drawScore_ = function() {
  var ctx = this.ctx_;
  ctx.fillStyle = '#FFF';
  ctx.font = '24px Courier';
  ctx.fillText('Chain: ' + this.chain_, 10, 30);
  ctx.fillText('Score: ' + this.score_, 160, 30);
};


musika.Game.prototype.drawGameOverScreen_ = function() {
  var ctx = this.ctx_;
  ctx.fillStyle = '#FFF';
  ctx.font = '24px Courier';
  var msg = 'Game Over';
  var textWidth = ctx.measureText(msg).width;
  ctx.fillText(msg, (this.canvas_.width - textWidth) / 2, this.canvas_.height / 2 - 60);
  msg = 'Score: ' + this.score_;
  textWidth = ctx.measureText(msg).width;
  ctx.fillText(msg, (this.canvas_.width - textWidth) / 2, this.canvas_.height / 2 - 30);
  msg = 'Max Chain: ' + this.maxChain_;
  textWidth = ctx.measureText(msg).width;
  ctx.fillText(msg, (this.canvas_.width - textWidth) / 2, this.canvas_.height / 2);
  msg = 'Thanks for playing!';
  textWidth = ctx.measureText(msg).width;
  ctx.fillText(msg, (this.canvas_.width - textWidth) / 2, this.canvas_.height / 2 + 30);
};


// -----------------------------------------------------------------------------
// Physics
// -----------------------------------------------------------------------------


musika.Game.prototype.createWorld = function() {
  var worldAABB = new b2AABB();
  worldAABB.minVertex.Set(-musika.Game.PHYSICS_BOUNDS, -musika.Game.PHYSICS_BOUNDS);
  worldAABB.maxVertex.Set(musika.Game.PHYSICS_BOUNDS, musika.Game.PHYSICS_BOUNDS);
  var gravity = new b2Vec2(0, 300);
  var doSleep = true;
  var world = new b2World(worldAABB, gravity, doSleep);
  return world;
};


musika.Game.prototype.createExplosion = function(x, y, timing) {
  for (var i = 0; i < 3; i++) {
    var rv = Math.random();
    var size = rv * 8 + 2;
    var polygon = this.createPolygon(
      x * musika.Game.PHYSICS_SCALE / this.canvas_.width,
      y * musika.Game.PHYSICS_SCALE / this.canvas_.width,
      size,
      Math.floor(Math.random() * 3) + 3);
    polygon.color = this.getTimingColor_(Math.abs(timing + Math.random() * 200 - 100));
    var force = 300;
    polygon.SetLinearVelocity(new b2Vec2(Math.random() * force - force/2, Math.random() * -force));
  }
};


musika.Game.prototype.createExplosion2 = function(x, y) {
  for (var i = 0; i < 12; i++) {
    var rv = Math.random();
    var size = rv * 10 + 2;
    var polygon = this.createPolygon(
      x * musika.Game.PHYSICS_SCALE / this.canvas_.width,
      y * musika.Game.PHYSICS_SCALE / this.canvas_.width,
      size,
      Math.floor(Math.random() * 5) + 3);
    polygon.color = this.color_(
        Math.floor(Math.random()*255),
        Math.floor(Math.random()*255),
        Math.floor(Math.random()*255),
        1);
    var force = 300;
    polygon.SetLinearVelocity(new b2Vec2(Math.random() * force - force/2, Math.random() * -force));
  }
};


musika.Game.prototype.createBox = function(x, y, width, height, fixed) {
  if (typeof(fixed) == 'undefined') fixed = true;
  var boxSd = new b2BoxDef();
  if (!fixed) boxSd.density = 1.0;
  boxSd.restitution = 0.1;
  boxSd.friction = 0.5;
  boxSd.extents.Set(width, height);
  var boxBd = new b2BodyDef();
  boxBd.AddShape(boxSd);
  boxBd.position.Set(x,y);
  return this.world_.CreateBody(boxBd);
};


musika.Game.prototype.createPolygon = function(x, y, radius, verticesCount) {
  var polygonSd = new b2PolyDef();
  polygonSd.vertexCount = verticesCount;
  for (var i = 0; i < verticesCount; i++) {
    var angle = i * 2 * Math.PI / verticesCount;
    var x2 = Math.cos(angle) * radius;
    var y2 = Math.sin(angle) * radius;
    polygonSd.vertices[i].Set(x2, y2);
  }
  polygonSd.density = 1.0;
  // Rounder polygons are bouncier.
  var restitutionsByVertices = [ 0, 0, 0, 0.01, 0.04, 0.1, 0.2, 0.2, 0.25];
  polygonSd.restitution = restitutionsByVertices[verticesCount];
  polygonSd.friction = 0.5;
  var polygonBd = new b2BodyDef();
  polygonBd.AddShape(polygonSd);
  polygonBd.position.Set(x, y);
  return this.world_.CreateBody(polygonBd);
};


// -----------------------------------------------------------------------------
// Music
// -----------------------------------------------------------------------------


musika.Game.GROUP_COLORS = [
  'rgba(200,0,0,',
  'rgba(200,200,0,',
  'rgba(0,200,0,',
  'rgba(0,200,200,',
  'rgba(0,0,200,',
  'rgba(200,0,200,',
];

musika.Game.prototype.processTaps_ = function() {
  var colorIndex = -1;
  for (var i = 0; i < this.taps_.length; i++) {
    var tap = this.taps_[i];
    tap.x = Math.floor(tap.x / 50) * 50;
    tap.y = Math.floor(tap.y / 50) * 50;
    if (tap.cat == 1) {
      // Start of a new grouping.
      colorIndex = (colorIndex + 1) % musika.Game.GROUP_COLORS.length;
    }
    tap.color = musika.Game.GROUP_COLORS[colorIndex];
  }
}


// -----------------------------------------------------------------------------
// Mouse Input
// -----------------------------------------------------------------------------


musika.Game.prototype.onMouseDown_ = function(event) {
  var x = event.pageX - this.canvas_.offsetLeft;
  var y = event.pageY - this.canvas_.offsetTop;

  var time = this.getTime_();

  // Loop through the taps that are being displayed.
  for (var i = this.tapPosition_; i < this.taps_.length; i++) {
    var tap = this.taps_[i];
    if (tap.time - musika.Game.SETUP_TIME < time &&
        tap.time + musika.Game.HOLD_TIME > time) {
      if (this.touchTap_(tap, time, x, y)) {
        var timing = Math.abs(time - tap.time);
        
        // Update chain.
        if (i == this.chainNext_) {
          // Chain!
          this.chain_++;
          if (this.chain_ > this.maxChain_) {
            this.maxChain_ = this.chain_;
          }
        } else {
          this.chain_ = 1;
        }
        this.chainNext_ = i + 1;

        // Update score.
        var maxScore = 100000;
        var tapScore = Math.floor(100000 - timing * timing);
        if (tapScore > 0) {
          this.score_ += tapScore * this.chain_;
        }

        this.createExplosion(
            tap.x * this.canvas_.width / musika.Game.TAP_X_SCALE,
            tap.y * this.canvas_.height / musika.Game.TAP_Y_SCALE,
            timing);
        break;
      }
    } else {
      break;
    }
  }

  event.preventDefault();
};


musika.Game.prototype.onMouseMove_ = function(event) {
  event.preventDefault();
};


musika.Game.prototype.onMouseUp_ = function(event) {
  event.preventDefault();
};


musika.Game.prototype.touchTap_ = function(tap, time, x, y) {
  if (tap.hit) {
    return;
  }
  var diffX = x - tap.x * this.canvas_.width / musika.Game.TAP_X_SCALE;
  var diffY = y - tap.y * this.canvas_.height / musika.Game.TAP_Y_SCALE;
  var distance = Math.sqrt(diffX*diffX + diffY*diffY);
  if (distance < musika.Game.TAP_RADIUS) {
    tap.hit = time;
    return true;
  }
  return false;
};
