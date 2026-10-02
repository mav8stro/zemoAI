const TAU = 2 * Math.PI;
function alphaFor(cutoff: number, dt: number): number {
    const tau = 1 / (TAU * cutoff);
    return 1 / (1 + tau / dt);
}
class LowPass {
    private value: number | null = null;
    filter(x: number, alpha: number): number {
        this.value = this.value === null ? x : alpha * x + (1 - alpha) * this.value;
        return this.value;
    }
    get last(): number | null {
        return this.value;
    }
    reset() {
        this.value = null;
    }
}
export class OneEuro {
    private x = new LowPass();
    private dx = new LowPass();
    private lastAt: number | null = null;
    private minCutoff: number;
    private beta: number;
    private dCutoff: number;
    constructor(minCutoff = 1.0, beta = 0.0, dCutoff = 1.0) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
    }
    filter(x: number, at: number): number {
        if (this.lastAt === null) {
            this.lastAt = at;
            this.dx.filter(0, alphaFor(this.dCutoff, 1 / 60));
            return this.x.filter(x, 1);
        }
        const dt = Math.min(Math.max(at - this.lastAt, 1 / 240), 1 / 5);
        this.lastAt = at;
        const prev = this.x.last;
        const speed = prev === null ? 0 : (x - prev) / dt;
        const edx = this.dx.filter(speed, alphaFor(this.dCutoff, dt));
        const cutoff = this.minCutoff + this.beta * Math.abs(edx);
        return this.x.filter(x, alphaFor(cutoff, dt));
    }
    reset() {
        this.x.reset();
        this.dx.reset();
        this.lastAt = null;
    }
}
export class OneEuroPoint {
    private fx: OneEuro;
    private fy: OneEuro;
    constructor(minCutoff: number, beta: number, dCutoff = 1.0) {
        this.fx = new OneEuro(minCutoff, beta, dCutoff);
        this.fy = new OneEuro(minCutoff, beta, dCutoff);
    }
    filter(x: number, y: number, at: number): {
        x: number;
        y: number;
    } {
        return { x: this.fx.filter(x, at), y: this.fy.filter(y, at) };
    }
    reset() {
        this.fx.reset();
        this.fy.reset();
    }
}
