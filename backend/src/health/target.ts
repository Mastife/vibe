export type MonitorTarget =
  | { kind: 'http'; url: string }
  | { kind: 'docker'; sshHost: string; container: string }

type TargetFields = {
  healthCheckUrl: string | null
  productionUrl: string | null
  sshHost: string | null
  dockerContainer: string | null
}

/**
 * What the monitor probes for a project: the explicit health-check URL, else the Docker container
 * over SSH (for services without an HTTP endpoint), else the production URL. Null means unmonitored.
 */
export function monitorTarget(project: TargetFields): MonitorTarget | null {
  if (project.healthCheckUrl) return { kind: 'http', url: project.healthCheckUrl }
  if (project.sshHost && project.dockerContainer) {
    return { kind: 'docker', sshHost: project.sshHost, container: project.dockerContainer }
  }
  if (project.productionUrl) return { kind: 'http', url: project.productionUrl }
  return null
}

/** Human-readable target for the UI and alerts, e.g. "docker bonustar-bot @ ubuntu@194.238.42.51". */
export function describeTarget(target: MonitorTarget | null): string | null {
  if (!target) return null
  return target.kind === 'http' ? target.url : `docker ${target.container} @ ${target.sshHost}`
}
