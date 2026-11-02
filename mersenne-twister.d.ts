declare module "mersenne-twister" {
  export default class MersenneTwister {
    constructor(seed?: number);
    random_int(): number;
    random(): number;
    init_seed(seed: number): void;
  }
}
