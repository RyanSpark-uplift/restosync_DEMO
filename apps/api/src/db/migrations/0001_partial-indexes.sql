-- AG-018: 활성 주문 display_number 매장별 unique (collected/cancelled 제외)
CREATE UNIQUE INDEX IF NOT EXISTS orders_active_dn_uniq
  ON orders (store_id, display_number)
  WHERE status NOT IN ('collected', 'cancelled');

-- AG-008: pairing_code 활성 시 unique (NULL 제외)
CREATE UNIQUE INDEX IF NOT EXISTS tv_pairing_code_uniq
  ON tv_screens (pairing_code)
  WHERE pairing_code IS NOT NULL;