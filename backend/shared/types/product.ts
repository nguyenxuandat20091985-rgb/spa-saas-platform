import { AuditFields, EntityStatus, TenantScoped } from './common';

export interface ProductCategory extends AuditFields, TenantScoped {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  sortOrder: number;
}

export interface Product extends AuditFields, TenantScoped {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  sku: string;
  barcode?: string;
  price: number;
  costPrice?: number;
  imageUrl?: string;
  images: string[];
  ingredients: string[];
  usageInstructions?: string;
  volume?: string;
  unit?: string;
  brand?: string;
  isActive: boolean;
  status: EntityStatus;
}

export interface CreateProductDto {
  categoryId: string;
  name: string;
  description?: string;
  sku: string;
  barcode?: string;
  price: number;
  costPrice?: number;
  ingredients?: string[];
  usageInstructions?: string;
  volume?: string;
  unit?: string;
  brand?: string;
}

export interface UpdateProductDto {
  categoryId?: string;
  name?: string;
  description?: string;
  sku?: string;
  barcode?: string;
  price?: number;
  costPrice?: number;
  imageUrl?: string;
  images?: string[];
  ingredients?: string[];
  usageInstructions?: string;
  volume?: string;
  unit?: string;
  brand?: string;
  isActive?: boolean;
  status?: EntityStatus;
}
