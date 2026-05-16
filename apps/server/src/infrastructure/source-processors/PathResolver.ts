import type { IPathResolver } from '../../core/ports/IPathResolver.js';
import { DATA_ROOT } from '../../services/paths.js';

export class PathResolver implements IPathResolver {
  readonly dataRoot = DATA_ROOT;
}
