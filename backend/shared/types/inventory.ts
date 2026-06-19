import { AuditFields, BranchScoped } from './common';

export type InventoryTransactionType = 'purchase' | 'sale' | 'adjustment' | 'transfer' | 'return' | 'waste';

export interface InventoryItem extends AuditFields, BranchScoped {
  id: string;
  productId: string;
  quantity: number;
  minQuantity: number;
  maxQuantity: number;
  location?: string;
}

export interface InventoryTransaction extends AuditFields, BranchScoped {
  id: string;
  productId: string;
  type: InventoryTransactionType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  referenceId?: string;
  referenceType?: string;
  notes?: string;
  performedBy: string;
}

export interface InventoryAlert {
  productId: string;
  productName: string;
  branchId: string;
  branchName: string;
  currentQuantity: number;
  minQuantity: number;
  alertType: 'low_stock' | 'out_of_stock' | 'overstock';
}

export interface ReceiveInventoryDto {
  branchId: string;
  items: { productId: string; quantity: number; notes?: string }[];
  referenceId?: string;
  notes?: string;
}

export interface DispatchInventoryDto {
  branchId: string;
  items: { productId: string; quantity: number; notes?: string }[];
  referenceId?: string;
  referenceType?: string;
  notes?: string;
}

export interface TransferInventoryDto {
  fromBranchId: string;
  toBranchId: string;
  items: { productId: string; quantity: number }[];
  notes?: string;
}
