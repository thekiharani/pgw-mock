import type { MerchantCapability } from '@shared/dto/merchant';

import { Badge } from '@/components/ui/badge';

const ORDER: MerchantCapability[] = ['c2b', 'b2c', 'b2b'];

// Compact C2B/B2C/B2B indicators shown wherever a merchant's enabled M-Pesa
// flows need surfacing (list rows, detail overview).
export function CapabilityBadges({ capabilities }: { capabilities: MerchantCapability[] }) {
  if (capabilities.length === 0) {
    return <span className="text-xs text-muted-foreground">None</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {ORDER.filter((c) => capabilities.includes(c)).map((c) => (
        <Badge key={c} variant="outline" className="text-[10px] uppercase tracking-wide">
          {c}
        </Badge>
      ))}
    </div>
  );
}
