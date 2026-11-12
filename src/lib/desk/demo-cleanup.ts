interface Book<P, O> { ok?: boolean; error?: unknown; positions?: P[]; orders?: O[] }
interface Cleanup<P, O> {
  read: () => Promise<Book<P, O>>;
  ownPosition: (position: P) => boolean;
  ownOrder: (order: O) => boolean;
  entryOrder: (order: O) => boolean;
  cancel: (orders: O[]) => Promise<unknown>;
  /** The caller retains one durable identity and reconciles an existing pending close. */
  close: (position: P) => Promise<unknown>;
  pendingCloses: () => number;
  observed?: (book: Book<P, O>) => void;
  attempts?: number;
}

/** Verify a new owned snapshot after cancellation; an acknowledgement alone is not flatness. */
export async function runDemoCleanup<P, O>(options: Cleanup<P, O>) {
  const attempts=options.attempts??4;
  if (!Number.isSafeInteger(attempts)||attempts<1||attempts>8) throw new Error("Invalid demo cleanup attempts");
  const read=async()=>{
    const book=await options.read();
    if(book.ok!==true||book.error||!Array.isArray(book.positions)||!Array.isArray(book.orders))
      throw new Error("Demo cleanup cannot verify the complete exchange book");
    options.observed?.(book);
    return {positions:book.positions.filter(options.ownPosition),orders:book.orders.filter(options.ownOrder)};
  };
  let result={complete:false,remainingOwnedPositions:0,remainingOwnedOrders:0,pendingCloses:0,attempt:0};
  for(let attempt=1;attempt<=attempts;attempt++){
    const initial=await read();
    await options.cancel(initial.orders.filter(options.entryOrder));
    // A resting entry may fill while its cancellation is being acknowledged.
    const confirmed=await read();
    for(const position of confirmed.positions)await options.close(position);
    const after=await read();
    if(!after.positions.length)await options.cancel(after.orders);
    const final=await read();
    const pending=options.pendingCloses();
    const knownPending=Number.isSafeInteger(pending)&&pending>=0;
    result={complete:knownPending&&pending===0&&!final.positions.length&&!final.orders.length,
      remainingOwnedPositions:final.positions.length,remainingOwnedOrders:final.orders.length,
      pendingCloses:knownPending?pending:-1,attempt};
    if(result.complete)break;
  }
  return result;
}
