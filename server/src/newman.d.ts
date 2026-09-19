declare module "newman" {
  const newman: {
    run(options: unknown, callback: (error: Error | null, summary: unknown) => void): unknown;
  };
  export default newman;
}
