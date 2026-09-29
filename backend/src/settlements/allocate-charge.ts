import { allocateBundlePrice } from '../subscriptions/allocate-price.js';

/** 결제에 든 방 하나 — 개인방이면 memberIds = [자기 id], 커플방이면 두 멤버 배우 id */
export interface ChargeRoom {
  id: string;
  monthlyPriceCents: number;
  memberIds: string[];
}

export interface AllocationLine {
  roomId: string;
  actorId: string;
  amountCents: number;
}

/**
 * 결제 1건 금액을 배우별 몫으로 나눔(잠정 정산 규칙 — STATUS "출시 전 확정할 정책").
 * 1) 방이 여러 개(묶음)면 각 방의 개인 정가 비율로 나눔(allocateBundlePrice — 통계·구독 이력과 같은 규칙).
 * 2) 커플방 몫은 두 배우가 똑같이 반씩.
 * 반올림 차이는 매 단계 마지막 몫에 몰아서 합이 정확히 결제 금액이 되게.
 */
export function allocateCharge(amountCents: number, rooms: ChargeRoom[]): AllocationLine[] {
  const byRoom = rooms.length === 1 ? new Map([[rooms[0].id, amountCents]]) : allocateBundlePrice(amountCents, rooms);
  return rooms.flatMap((room) => {
    const roomAmount = byRoom.get(room.id) ?? 0;
    const members = room.memberIds.length > 0 ? room.memberIds : [room.id];
    const split = allocateBundlePrice(roomAmount, members.map((id) => ({ id, monthlyPriceCents: 1 })));
    return members.map((actorId) => ({ roomId: room.id, actorId, amountCents: split.get(actorId) ?? 0 }));
  });
}

/** 매달 같은 날짜로 k개월 뒤(31일 → 다음 달 말일처럼 달 길이에 맞춤) */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
