var playground = {};


// -----------------------------------------------------------------------------
// playground.Demo - Just create me, I'll do the rest.
// -----------------------------------------------------------------------------

/**
 * @param {Object|string} canvas The canvas element
 * @constructor
 */
playground.Demo = function(canvas) {

  // Setup canvas.
  this.canvas_ = canvas;
  this.ctx_ = this.canvas_.getContext('2d');
  this.canvas_.width = window.innerWidth;
  this.canvas_.height = window.innerHeight;
  this.scale_ = this.canvas_.width / 200;
  this.bounds_ = 300;

  // Initialize simulation.
  this.world_ = this.createWorld();
  this.frameCount_ = 0;

  // Setup ground.
  this.createBox(
      (this.canvas_.width / 2) / this.scale_,
      (this.canvas_.height + 50) / this.scale_,
      (this.canvas_.width / 2) / this.scale_,
      50 / this.scale_,
      true);
  
  // Mouse listeners.
  this.mouseX_;
  this.mouseY_;
  this.mouseBody_;
  this.canvas_.addEventListener('mousedown', this.onMouseDown_.bind(this));
  this.canvas_.addEventListener('mousemove', this.onMouseMove_.bind(this));
  this.canvas_.addEventListener('mouseup', this.onMouseUp_.bind(this));

  this.canvas_.addEventListener('touchstart', this.onMouseDown_.bind(this));
  this.canvas_.addEventListener('touchmove', this.onMouseMove_.bind(this));
  this.canvas_.addEventListener('touchend', this.onMouseUp_.bind(this));

  // Advance.
  this.step_();
};


// -----------------------------------------------------------------------------
// Advances and draws the simulation.
// -----------------------------------------------------------------------------


playground.Demo.prototype.step_ = function() {
  this.world_.Step(
    1.0/60, // time step
    10, // velocity iterations
    3); // position iterations

  // Draw the background.
  this.ctx_.fillStyle = 'rgba(0,0,0,1)';
  this.ctx_.fillRect(0, 0, this.canvas_.width, this.canvas_.height);

  // Draw the world.
  this.drawWorld_(this.world_, this.ctx_);

  // Add new bodies.
  if (this.frameCount_ % 20 == 0) {
    var rv = Math.random();
    var radius = rv * 16 + 4;
    var polygon = this.createPolygon(
        Math.random() * this.canvas_.width / this.scale_, // x
        -16, // y
        radius, // radius
        Math.floor(Math.random() * 6) + 3); // # of vertices
    polygon.isOriginal = true;
    polygon.SetLinearVelocity(new b2Vec2(0, 50));
  }

  // Loop through our bodies.
  for (var b = this.world_.m_bodyList; b; b = b.m_next) {
    // Clear the shapes that are out of bounds.
    if (b.m_position.y <= -this.bounds_ ||
        b.m_position.y >= this.bounds_  ||
        b.m_position.x <= -this.bounds_ ||
        b.m_position.x >= this.bounds_) {
      this.world_.DestroyBody(b);
    }
  }

  // Drag mouse body.
  if (this.mouseBody_) {
    var bCenter = new b2Vec2(this.mouseBody_.m_position.x, this.mouseBody_.m_position.y);
    var force = new b2Vec2(this.mouseX_ / this.scale_, this.mouseY_ / this.scale_);
    force.Subtract(bCenter);
    force.Multiply(16);
    this.mouseBody_.SetLinearVelocity(force);
  }

  this.frameCount_++;
  this.requestAnimationFrame_(this.step_.bind(this));
};


// Taken from:
// http://paulirish.com/2011/requestanimationframe-for-smart-animating/
playground.Demo.prototype.requestAnimationFrame_ = function(callback) {
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
// Methods to create objects and shapes.
// -----------------------------------------------------------------------------


playground.Demo.prototype.createWorld = function() {
  var worldAABB = new b2AABB();
  worldAABB.minVertex.Set(-this.bounds_, -this.bounds_);
  worldAABB.maxVertex.Set(this.bounds_, this.bounds_);
  var gravity = new b2Vec2(0, 0);
  var doSleep = true;
  var world = new b2World(worldAABB, gravity, doSleep);
  return world;
};


playground.Demo.prototype.createBall = function(x, y, radius) {
  var ballSd = new b2CircleDef();
  ballSd.density = 1.0;
  ballSd.radius = radius;
  ballSd.restitution = 0.5;
  ballSd.friction = 0.2;
  var ballBd = new b2BodyDef();
  ballBd.AddShape(ballSd);
  ballBd.position.Set(x,y);
  return this.world_.CreateBody(ballBd);
};


playground.Demo.prototype.createBox = function(x, y, width, height, fixed) {
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


playground.Demo.prototype.createPolygon = function(x, y, radius, verticesCount) {
  var polygonSd = new b2PolyDef();
  polygonSd.vertexCount = verticesCount;
  for (var i = 0; i < verticesCount; i++) {
    var angle = i * 2 * Math.PI / verticesCount;
    var x2 = Math.cos(angle) * radius;
    var y2 = Math.sin(angle) * radius;
    polygonSd.vertices[i].Set(x2, y2);
  }
  polygonSd.density = 1.0;
  polygonSd.restitution = 0.1;
  polygonSd.friction = 0.5;
  var polygonBd = new b2BodyDef();
  polygonBd.AddShape(polygonSd);
  polygonBd.position.Set(x, y);
  return this.world_.CreateBody(polygonBd);
};


playground.Demo.prototype.explodeShape = function(shape) {
  for (var i = 0; i < shape.m_vertexCount; i++) {
    // Create triangle.
    var triangleSd = new b2PolyDef();
    triangleSd.vertexCount = 3;
    triangleSd.vertices[0].Set(0, 0);
    triangleSd.vertices[1].Set(shape.m_vertices[i].x, shape.m_vertices[i].y);
    triangleSd.vertices[2].Set(shape.m_vertices[(i+1)%shape.m_vertexCount].x, shape.m_vertices[(i+1)%shape.m_vertexCount].y);
    console.log(triangleSd);
    triangleSd.density = 1.0;
    triangleSd.restitution = 0.1;
    triangleSd.friction = 0.5;
    var triangleBd = new b2BodyDef();
    triangleBd.AddShape(triangleSd);
    triangleBd.position.Set(shape.m_position.x, shape.m_position.y);
    var triangle = this.world_.CreateBody(triangleBd);

    triangle.originalVertexCount = shape.m_vertexCount;
    var force = 50;
    triangle.SetLinearVelocity(new b2Vec2(shape.m_vertices[i].x * force, shape.m_vertices[i].y * force));
  }
  this.world_.DestroyBody(shape.GetBody());
};


// -----------------------------------------------------------------------------
// Mouse Input
// -----------------------------------------------------------------------------


playground.Demo.prototype.onMouseDown_ = function(event) {
  this.mouseX_ = event.pageX - this.canvas_.offsetLeft;
  this.mouseY_ = event.pageY - this.canvas_.offsetTop;

  // Loop through our bodies.
  for (var b = this.world_.m_bodyList; b; b = b.m_next) {
    // Check if the point is in the body.
    if (b.GetShapeList() &&
        b.GetShapeList().TestPoint(new b2Vec2(this.mouseX_ / this.scale_, this.mouseY_ / this.scale_))) {
      this.mouseBody_ = b;
      break;
    }
  }

  if (this.mouseBody_) {
    if (this.mouseBody_.isOriginal) {
      this.explodeShape(this.mouseBody_.GetShapeList());
      this.mouseBody_ = undefined;
    } else {
      this.mouseBody_.isMouseBody = true;
    }
  }
};


playground.Demo.prototype.onMouseMove_ = function(event) {
  this.mouseX_ = event.pageX - this.canvas_.offsetLeft;
  this.mouseY_ = event.pageY - this.canvas_.offsetTop;
};


playground.Demo.prototype.onMouseUp_ = function(event) {
  this.mouseX_ = event.pageX - this.canvas_.offsetLeft;
  this.mouseY_ = event.pageY - this.canvas_.offsetTop;

  if (this.mouseBody_) {
    this.mouseBody_.isMouseBody = false;
  }
  this.mouseBody_ = undefined;
};


// -----------------------------------------------------------------------------
// Draw Methods
// -----------------------------------------------------------------------------


playground.Demo.prototype.drawWorld_ = function(world, context) {
  context.save();
  context.scale(this.scale_, this.scale_);

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

  if (this.mouseBody_) {
    for (var s = this.mouseBody_.GetShapeList(); s != null; s = s.GetNext()) {
      this.drawShape_(s, context, true);
    }
  }

  context.restore();
};


playground.Demo.prototype.drawJoint_ = function(joint, context) {
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


playground.Demo.prototype.drawShape_ = function(shape, context, opt_stroke) {
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
      context.strokeStyle = '#000';
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
      if (poly.GetBody().originalVertexCount) {
        context.fillStyle = this.getColor_(poly.GetBody().originalVertexCount - 3);
      } else {
        context.fillStyle = this.getColor_(poly.m_vertexCount - 3);
      }
      context.strokeStyle = '#FFF';
    }
    break;
  }

  context.fill();
  if (opt_stroke) {
    context.stroke();
  }
};


playground.Demo.COLORS = [
    '#4D90FE', // Blue
    '#D14836', // Red
    '#3D9400', // Green
    '#FFD700', // Yellow
    '#503503', // Brown
    '#FF8C00', // Orange
    '#9370D8', // Purple
    '#8B4513', // Brown
    '#708090'  // Gray
];


playground.Demo.prototype.getColor_ = function(index) {
  return playground.Demo.COLORS[index % playground.Demo.COLORS.length];
};