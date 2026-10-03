import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FISH,
  MAX_FISH,
  SPINE_NODES,
} from "./config";
import { Koi, SwimState } from "./koi";
import { TinyFishSchools } from "./tiny-fish";
import {
  add,
  clamp,
  fromAngle,
  length,
  lerp,
  mul,
  normalize,
  perpendicular,
  sub,
  type Vec2,
  vec,
  wrapAngle,
  XorShift32,
} from "./math";
import { RippleSystem } from "./ripple-system";

export class School {
  public readonly fish: Koi[] = Array.from({ length: MAX_FISH }, () => new Koi());
  public readonly ripples = new RippleSystem();
  public readonly tinyFish = new TinyFishSchools();

  public count: number = FISH.initialCount;
  public targetActive = false;

  private random = new XorShift32();
  private target = vec(CANVAS_WIDTH * 0.5, CANVAS_HEIGHT * 0.5);
  private targetAge = 0;

  public constructor() {
    this.fish.forEach((fish, index) => fish.reset(index, this.random));
  }

  public setCount(count: number): void {
    this.count = clamp(Math.round(count), 1, MAX_FISH);
  }

  public updateBodyProportions(previous: {
    regularLength: readonly [number, number];
    tinyLength: readonly [number, number];
    regularWidthRatio: readonly [number, number];
    tinyWidthRatio: readonly [number, number];
    tinyEvery: number;
  }): void {
    const midpoint = (range: readonly [number, number]): number =>
      (range[0] + range[1]) * 0.5;
    for (const [index, fish] of this.fish.entries()) {
      const wasTiny = index % previous.tinyEvery === previous.tinyEvery - 1;
      const isTiny = index % FISH.tinyEvery === FISH.tinyEvery - 1;
      const oldLength = midpoint(wasTiny ? previous.tinyLength : previous.regularLength);
      const newLength = midpoint(isTiny ? FISH.tinyLength : FISH.regularLength);
      const oldWidth = midpoint(
        wasTiny ? previous.tinyWidthRatio : previous.regularWidthRatio,
      );
      const newWidth = midpoint(isTiny ? FISH.tinyWidthRatio : FISH.regularWidthRatio);
      const lengthRatio = newLength / Math.max(oldLength, 0.001);
      fish.bodyLength *= lengthRatio;
      fish.bodyWidth *= lengthRatio * newWidth / Math.max(oldWidth, 0.001);
    }
  }

  public resize(scaleX: number, scaleY: number): void {
    for (const fish of this.fish) {
      const nextX = fish.position.x * scaleX;
      const nextY = fish.position.y * scaleY;
      const shiftX = nextX - fish.position.x;
      const shiftY = nextY - fish.position.y;
      fish.position.x = nextX;
      fish.position.y = nextY;
      for (const node of fish.spine) {
        node.x += shiftX;
        node.y += shiftY;
      }
      for (const node of fish.renderSpine) {
        node.x += shiftX;
        node.y += shiftY;
      }
    }
    this.target.x *= scaleX;
    this.target.y *= scaleY;
    this.tinyFish.resize(scaleX, scaleY);
    for (const ripple of this.ripples.instances) {
      ripple.center.x *= scaleX;
      ripple.center.y *= scaleY;
    }
  }

  public reset(): void {
    this.random.state = 0x00c0ffee;
    this.fish.forEach((fish, index) => fish.reset(index, this.random));
    this.tinyFish.reset();
    this.ripples.reset();
    this.targetActive = false;
  }

  public setRainIntensity(intensity: number): void {
    this.ripples.setRainIntensity(intensity);
  }

  public callTo(point: Vec2): void {
    this.target = { ...point };
    this.targetActive = true;
    this.targetAge = 0;
    for (let index = 0; index < this.count; index += 1) {
      const fish = this.fish[index];
      const response = FISH.callResponse;
      const distanceToCall = length(sub(fish.position, point));
      const distanceAmount = Math.pow(
        clamp(distanceToCall / Math.max(1, response.distanceAtMaximumDelay), 0, 1),
        response.distanceExponent,
      );
      fish.callDelay =
        response.minimumDelaySeconds +
        distanceAmount * response.maximumDistanceDelaySeconds +
        this.random.range(0, response.randomJitterSeconds) +
        (1 - fish.reactivity) * response.temperamentDelaySeconds;
      fish.respondedToCall = false;
      fish.callResponseAge = 0;
    }
    this.tinyFish.fleeFrom(point);
    this.ripples.trigger("touch", point);
  }

  public scatter(): void {
    for (let index = 0; index < this.count; index += 1) {
      const fish = this.fish[index];
      fish.pivotHeading = wrapAngle(fish.heading + this.random.range(-1.35, 1.35));
      fish.escapeTime = 0.65 + fish.reactivity * 0.55;
      this.enterState(fish, SwimState.Burst);
    }
    this.targetActive = false;
  }

  public update(dt: number, time: number): void {
    this.targetAge += dt;
    if (
      this.targetActive &&
      this.targetAge > FISH.callResponse.targetLifetimeSeconds * 1.15
    ) {
      this.targetActive = false;
    }

    const desired: Vec2[] = [];
    const desiredSpeed: number[] = [];
    for (let index = 0; index < this.count; index += 1) {
      const fish = this.fish[index];
      fish.escapeTime = Math.max(0, fish.escapeTime - dt);
      fish.callDelay = Math.max(0, fish.callDelay - dt);
      if (this.targetActive && fish.respondedToCall) {
        fish.callResponseAge += dt;
      }
      if (this.targetActive && fish.callDelay <= 0 && !fish.respondedToCall) {
        fish.respondedToCall = true;
        fish.callResponseAge = 0;
        fish.targetDepth = FISH.depth.callRiseDepth;
        fish.depthTransitionRate = 3 / Math.max(FISH.depth.callRiseSeconds, 0.1);
        this.enterState(fish, SwimState.Burst);
      }
      // Each fish loses interest at its own pace. Both arrival and departure
      // are continuous, including a second tap while a call is already active.
      const attentionEnd = FISH.callResponse.targetLifetimeSeconds * (0.82 + fish.reactivity * 0.33);
      const attention = this.targetActive && fish.respondedToCall
        ? clamp((attentionEnd - this.targetAge) / 1.35, 0, 1) * clamp(fish.callResponseAge / 0.55, 0, 1)
        : 0;
      fish.callInfluence += (attention - fish.callInfluence) * (1 - Math.exp(-3.2 * dt));
      this.updateNaturalState(fish, dt);
      this.updateDepth(fish, dt);
      this.updateFeeding(fish, dt);
      desired[index] = this.steeringFor(index, time);
      desiredSpeed[index] = this.desiredSpeedFor(index);
    }
    for (let index = 0; index < this.count; index += 1) {
      const fish = this.fish[index];
      this.integrate(fish, desired[index], desiredSpeed[index], dt);
    }
    this.tinyFish.update(dt, time);

    this.ripples.update(dt);
  }

  private updateDepth(fish: Koi, dt: number): void {
    fish.depthStateAge += dt;
    const risingForCall = fish.callInfluence > 0.2;
    if (!risingForCall && fish.depthStateAge >= fish.depthStateDuration) {
      fish.depthStateAge = 0;
      if (this.behaviorUnit(fish) < FISH.depth.changeProbability) {
        fish.inDeepPeriod = !fish.inDeepPeriod;
      }
      const range = fish.inDeepPeriod
        ? FISH.depth.deepRange
        : FISH.depth.shallowRange;
      const durations = fish.inDeepPeriod
        ? FISH.depth.deepDurationSeconds
        : FISH.depth.surfaceDurationSeconds;
      fish.targetDepth = this.behaviorRange(fish, range[0], range[1]);
      fish.depthStateDuration = this.behaviorRange(
        fish,
        durations[0],
        durations[1],
      );
      const transitionSeconds = this.behaviorRange(
        fish,
        FISH.depth.transitionSeconds[0],
        FISH.depth.transitionSeconds[1],
      );
      fish.depthTransitionRate = 3 / Math.max(transitionSeconds, 0.1);
    }

    fish.depth +=
      (fish.targetDepth - fish.depth) *
      (1 - Math.exp(-fish.depthTransitionRate * dt));
  }

  private updateFeeding(fish: Koi, dt: number): void {
    fish.gulpAnimation = Math.max(0, fish.gulpAnimation - dt);
    fish.gulpCountdown -= dt;
    if (fish.gulpCountdown > 0) return;

    const calmState =
      fish.state === SwimState.Hover ||
      fish.state === SwimState.Coast ||
      fish.state === SwimState.Glide;
    const chasing = this.targetActive && fish.respondedToCall;
    const eligible =
      calmState &&
      !chasing &&
      fish.depth <= FISH.feeding.eligibleDepth &&
      fish.speed <= fish.cruiseSpeed * FISH.feeding.eligibleSpeedFraction;

    if (!eligible) {
      fish.gulpCountdown = this.behaviorRange(
        fish,
        FISH.feeding.retryDelaySeconds[0],
        FISH.feeding.retryDelaySeconds[1],
      );
      return;
    }

    const forwardX = Math.cos(fish.heading);
    const forwardY = Math.sin(fish.heading);
    const mouthDistance = fish.bodyWidth * FISH.feeding.mouthForwardOffset;
    this.ripples.trigger("mouth", {
      x: fish.position.x + forwardX * mouthDistance,
      y: fish.position.y + forwardY * mouthDistance,
    });
    fish.gulpAnimation = FISH.feeding.animationDurationSeconds;
    fish.gulpCountdown = this.behaviorRange(
      fish,
      FISH.feeding.intervalSeconds[0],
      FISH.feeding.intervalSeconds[1],
    );
  }

  private behaviorUnit(fish: Koi): number {
    let value = fish.behaviorRng >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    fish.behaviorRng = value >>> 0;
    return (fish.behaviorRng & 0x00ffffff) / 0x01000000;
  }

  private behaviorRange(fish: Koi, low: number, high: number): number {
    return low + (high - low) * this.behaviorUnit(fish);
  }

  private enterState(fish: Koi, next: SwimState): void {
    fish.state = next;
    fish.stateAge = 0;
    switch (next) {
      case SwimState.Glide:
        fish.stateDuration = this.behaviorRange(fish, 1.7, 5.2);
        break;
      case SwimState.Coast:
        fish.stateDuration = this.behaviorRange(fish, 0.9, 2.3);
        break;
      case SwimState.Hover:
        fish.stateDuration = this.behaviorRange(fish, 1.2, 1.9);
        break;
      case SwimState.Burst:
        fish.stateDuration = this.behaviorRange(fish, 0.32, 0.92);
        break;
      case SwimState.Pivot: {
        fish.stateDuration = this.behaviorRange(fish, 0.55, 0.95);
        const direction = this.behaviorUnit(fish) < 0.5 ? -1 : 1;
        fish.pivotHeading = wrapAngle(
          fish.heading + direction * this.behaviorRange(fish, 0.45, 1.55),
        );
        break;
      }
    }
  }

  private updateNaturalState(fish: Koi, dt: number): void {
    fish.stateAge += dt;
    // Resume propulsion before passive drag can turn coasting into a stop.
    if (fish.state === SwimState.Coast && fish.speed < fish.cruiseSpeed * 0.48) {
      this.enterState(fish, SwimState.Glide);
    }
    if (fish.state === SwimState.Hover && fish.callInfluence > 0.2) {
      this.enterState(fish, SwimState.Glide);
    }
    if (fish.stateAge < fish.stateDuration) return;

    const roll = this.behaviorUnit(fish);
    switch (fish.state) {
      case SwimState.Glide:
        if (roll < 0.40) this.enterState(fish, SwimState.Coast);
        else if (roll < 0.42) this.enterState(fish, SwimState.Hover);
        else if (roll < 0.56) this.enterState(fish, SwimState.Pivot);
        else if (roll < 0.73) this.enterState(fish, SwimState.Burst);
        else this.enterState(fish, SwimState.Glide);
        break;
      case SwimState.Coast:
        if (roll < 0.70) this.enterState(fish, SwimState.Glide);
        else if (roll < 0.85) this.enterState(fish, SwimState.Pivot);
        else this.enterState(fish, SwimState.Burst);
        break;
      case SwimState.Hover:
        if (roll < 0.34) this.enterState(fish, SwimState.Pivot);
        else if (roll < 0.55) this.enterState(fish, SwimState.Burst);
        else this.enterState(fish, SwimState.Glide);
        break;
      case SwimState.Burst:
        this.enterState(fish, SwimState.Coast);
        break;
      case SwimState.Pivot:
        this.enterState(fish, roll < 0.38 ? SwimState.Burst : SwimState.Glide);
        break;
    }
  }

  private steeringFor(index: number, time: number): Vec2 {
    const fish = this.fish[index];
    const forward = fromAngle(fish.heading);
    let steering = mul(forward, 0.95);

    if (fish.state === SwimState.Pivot || fish.escapeTime > 0) {
      steering = mul(fromAngle(fish.pivotHeading), 4.7);
    } else if (fish.state !== SwimState.Hover) {
      const wander =
        Math.sin(time * 0.29 + fish.wanderSeed) * 0.7 +
        Math.sin(time * 0.113 + fish.wanderSeed * 1.73) * 0.45;
      steering = add(steering, mul(fromAngle(fish.heading + wander), 0.62));
    }

    let separation = vec();
    let alignment = vec();
    let cohesion = vec();
    let neighbours = 0;

    for (let other = 0; other < this.count; other += 1) {
      if (other === index) continue;
      // A short look ahead softens avoidance before bodies overlap. Keep the
      // small, predictable O(n²) neighbourhood rather than adding an index.
      const offset = sub(add(fish.position, mul(fish.velocity, 0.2)),
        add(this.fish[other].position, mul(this.fish[other].velocity, 0.2)));
      const distance = length(offset);
      if (distance > 0.001 && distance < 37) {
        neighbours += 1;
        cohesion = add(cohesion, this.fish[other].position);
        alignment = add(alignment, normalize(this.fish[other].velocity));
        const personalSpace = 12 + (fish.bodyWidth + this.fish[other].bodyWidth) * 0.65;
        if (distance < personalSpace) {
          separation = add(separation, mul(normalize(offset), (personalSpace - distance) / personalSpace));
        }
      }
    }

    if (neighbours > 0) {
      cohesion = normalize(sub(mul(cohesion, 1 / neighbours), fish.position), forward);
      alignment = normalize(alignment, forward);
      steering = add(steering, mul(cohesion, 0.25));
      steering = add(steering, mul(alignment, 0.42));
      steering = add(steering, mul(separation, 2.8));
    }

    const margin = 32;
    const edgeForce = vec();
    if (fish.position.x < margin) edgeForce.x += (margin - fish.position.x) / margin;
    if (fish.position.x > CANVAS_WIDTH - margin) {
      edgeForce.x -= (fish.position.x - (CANVAS_WIDTH - margin)) / margin;
    }
    if (fish.position.y < margin) edgeForce.y += (margin - fish.position.y) / margin;
    if (fish.position.y > CANVAS_HEIGHT - margin) {
      edgeForce.y -= (fish.position.y - (CANVAS_HEIGHT - margin)) / margin;
    }
    steering = add(steering, mul(edgeForce, 4.8));

    if (fish.callInfluence > 0.001) {
      const toTarget = sub(this.target, fish.position);
      const distance = length(toTarget);
      const orbitRadius = 12 + fish.bodyWidth * 1.5 + fish.reactivity * 7;
      const approach = clamp((distance - orbitRadius) / 22, 0, 1);
      const direction = normalize(toTarget, forward);
      const orbitSign = Math.sin(fish.phaseOffset) < 0 ? -1 : 1;
      const radial = approach * 2.8 - clamp((orbitRadius - distance) / orbitRadius, 0, 1) * 1.4;
      const orbit = add(mul(direction, radial), mul(perpendicular(direction), (1 - approach) * 1.65 * orbitSign));
      steering = add(steering, mul(orbit, fish.callInfluence));
    }

    return normalize(steering, forward);
  }

  private desiredSpeedFor(index: number): number {
    const fish = this.fish[index];
    const chaseDuration = FISH.callResponse.chaseBoostSeconds;
    const chasing =
      fish.callInfluence > 0.001 &&
      fish.callResponseAge < chaseDuration;
    if (chasing) {
      const chaseFade = 1 - clamp(fish.callResponseAge / Math.max(chaseDuration, 0.01), 0, 1);
      const arrival = clamp(length(sub(this.target, fish.position)) / 95, 0.16, 1);
      const pursuit = (
        fish.maximumSpeed *
        (FISH.callResponse.chaseSpeedMultiplier +
          chaseFade * FISH.callResponse.initialExtraSpeedMultiplier)
      ) * arrival;
      return fish.cruiseSpeed + (pursuit - fish.cruiseSpeed) * fish.callInfluence;
    }

    let intention = fish.cruiseSpeed;
    if (fish.callInfluence > 0.001) {
      const distance = length(sub(this.target, fish.position));
      const urgency = clamp(distance / 105, 0.2, 1);
      intention = fish.cruiseSpeed + (fish.maximumSpeed - fish.cruiseSpeed) * urgency * fish.callInfluence;
    }

    switch (fish.state) {
      case SwimState.Glide:
        return intention;
      case SwimState.Coast:
        return fish.callInfluence > 0.2 ? intention : fish.speed;
      case SwimState.Hover:
        return fish.cruiseSpeed * 0.1;
      case SwimState.Burst:
        return fish.maximumSpeed * 1.08;
      case SwimState.Pivot:
        return fish.cruiseSpeed * 0.68;
    }
  }

  private integrate(fish: Koi, desired: Vec2, desiredSpeed: number, dt: number): void {
    const desiredHeading = Math.atan2(desired.y, desired.x);
    const headingError = wrapAngle(desiredHeading - fish.heading);
    const pivoting = fish.state === SwimState.Pivot;
    const progress = clamp(fish.stateAge / fish.stateDuration, 0, 1);
    const bendPulse = pivoting ? Math.sin(Math.PI * progress) : 0;
    const turnMultiplier = pivoting ? 0.8 + bendPulse * 1.6 : 1;
    const angularDamping = pivoting ? 4.8 : 4.1;
    const angularAcceleration =
      headingError * fish.turnStrength * turnMultiplier - fish.angularVelocity * angularDamping;
    fish.angularVelocity += angularAcceleration * dt;
    const maximumTurnRate = pivoting ? 2.9 : 2.1;
    fish.angularVelocity = clamp(fish.angularVelocity, -maximumTurnRate, maximumTurnRate);
    fish.heading = wrapAngle(fish.heading + fish.angularVelocity * dt);

    let speedResponse = 1.65;
    let desiredTailEffort = 0.62;
    switch (fish.state) {
      case SwimState.Glide:
        break;
      case SwimState.Coast:
        speedResponse = 1.2;
        desiredTailEffort = fish.callInfluence > 0.2 ? 0.55 : 0.025;
        break;
      case SwimState.Hover:
        speedResponse = 1.2;
        desiredTailEffort = 0.035;
        break;
      case SwimState.Burst:
        speedResponse = 4.2;
        desiredTailEffort = 1.22;
        break;
      case SwimState.Pivot:
        speedResponse = 1.6;
        desiredTailEffort = 0.5 + bendPulse * 0.4;
        break;
    }

    const corneringSpeed = desiredSpeed * (1 - 0.38 * clamp(Math.abs(headingError) / Math.PI, 0, 1));
    const previousSpeed = fish.speed;
    if (fish.state === SwimState.Coast && fish.callInfluence <= 0.2 && fish.escapeTime <= 0) {
      // Quadratic drag: dv/dt = -k v². Coast retains momentum, independent
      // of heading corrections. Coefficients are an artistic scale, not CFD.
      fish.speed /= 1 + 0.48 * fish.speed / fish.cruiseSpeed * dt;
    } else {
      fish.speed += (corneringSpeed - fish.speed) * (1 - Math.exp(-speedResponse * dt));
    }
    fish.acceleration += ((fish.speed - previousSpeed) / dt - fish.acceleration) * (1 - Math.exp(-7 * dt));
    const thrust = clamp(fish.acceleration / fish.cruiseSpeed, 0, 1);
    if (fish.state === SwimState.Glide || fish.state === SwimState.Burst) {
      desiredTailEffort *= 0.72 + 0.28 * clamp(fish.speed / fish.cruiseSpeed, 0, 1.5);
      desiredTailEffort += thrust * 0.2;
    }
    fish.tailEffort += (desiredTailEffort - fish.tailEffort) * (1 - Math.exp(-6 * dt));
    // A short bend followed by recoil, with a smaller bend for ordinary steering.
    const recoil = pivoting && progress > 0.62 ? Math.sin((progress - 0.62) / 0.38 * Math.PI) * 0.3 : 0;
    const desiredBend = clamp(headingError, -1, 1) * (pivoting ? bendPulse - recoil : 0.3);
    fish.turnBend += (desiredBend - fish.turnBend) * (1 - Math.exp(-9 * dt));
    fish.velocity = mul(fromAngle(fish.heading), fish.speed);
    fish.position = add(fish.position, mul(fish.velocity, dt));

    const beatRate = Math.PI * 2 * (0.55 + fish.speed / Math.max(fish.bodyLength, 1) * 1.25 + thrust * 0.35)
      * (0.55 + Math.min(fish.tailEffort, 1) * 0.45) * (0.92 + fish.reactivity * 0.15);
    fish.swimPhase += beatRate * dt;
    fish.finPhase += (3.2 + fish.reactivity + (1 - Math.min(fish.speed / fish.cruiseSpeed, 1)) * 2.2) * dt;

    fish.spine[0] = { ...fish.position };
    const spacing = fish.bodyLength / (SPINE_NODES - 1);
    for (let node = 1; node < SPINE_NODES; node += 1) {
      const fallback = mul(fromAngle(fish.heading), -1);
      const direction = normalize(sub(fish.spine[node], fish.spine[node - 1]), fallback);
      const constrained = add(fish.spine[node - 1], mul(direction, spacing));
      const tailAmount = node / (SPINE_NODES - 1);
      const stiffness = 0.94 - tailAmount * 0.17;
      fish.spine[node] = lerp(fish.spine[node], constrained, stiffness);
    }
  }

}
