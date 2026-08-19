import { Container, WorkerEntrypoint } from "cloudflare:workers";

class AegirContainer extends Container {
  defaultPort = 8081;
  sleepAfter = "10m";
}

export default class extends WorkerEntrypoint {
  async fetch(request: Request): Promise<Response> {
    const id = this.env.AEGIR_CONTAINER.idFromName("aegir");
    const stub = this.env.AEGIR_CONTAINER.get(id);
    return stub.fetch(request);
  }
}
