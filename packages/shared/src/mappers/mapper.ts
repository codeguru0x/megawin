/**
 * Map Source object to D  object
 * @template S - Source type
 * @template D - Destination type
 * @example
 * const mapper = new Mapper<Source, Destination>();
 * const source = new Source();
 * const destination = mapper.map(source);
 * console.log(destination);
 */
export abstract class Mapper<S, D> {
  constructor() {}

  /**
   * Map properties from source to destination
   * @param source
   * @returns
   */
  protected abstract mapProps(source: S): D;

  /**
   * Map Source object to Destination object
   * @param sources
   */
  public mapOne(source: S): D | null {
    if (source == null) {
      return null;
    }

    return this.mapProps(source);
  }

  /**
   * Map Source objects to TEntity objects
   * @param sources
   * @returns
   */
  public map(sources: S[]): D[] | null {
    if (!sources || !Array.isArray(sources)) {
      return null;
    }

    const destinations: D[] = [];
    for (const s of sources) {
      if (!s) {
        continue;
      }
      // Map each source to destination
      destinations.push(this.mapProps(s));
    }

    return destinations;
  }
}
