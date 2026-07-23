import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/utils/formatters.dart';
import 'package:spa_shared/widgets/loading_widget.dart';
import 'package:spa_shared/widgets/empty_state_widget.dart';
import '../../bloc/pos/pos_bloc.dart';
import '../../bloc/pos/pos_event.dart';
import '../../bloc/pos/pos_state.dart';
import '../../bloc/cart/cart_bloc.dart';
import '../../bloc/cart/cart_event.dart';
import '../../bloc/cart/cart_state.dart';
import '../../widgets/product_item.dart';
import '../../widgets/cart_item.dart';
import '../../widgets/pos_category_chip.dart';
import '../../widgets/inventory_stat.dart';
import '../../widgets/payment_sheet.dart';

class PosScreen extends StatefulWidget {
  const PosScreen({super.key});

  @override
  State<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends State<PosScreen>
    with SingleTickerProviderStateMixin, AutomaticKeepAliveClientMixin {
  late TabController _tabController;
  String _selectedCategory = 'all';
  String _searchQuery = '';

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _loadData() {
    context.read<PosBloc>().add(const LoadProductsEvent());
    context.read<PosBloc>().add(const LoadCategoriesEvent());
    context.read<PosBloc>().add(const LoadOrdersEvent());
    context.read<PosBloc>().add(const LoadInventoryEvent());
  }

  void _onCategorySelected(String category) {
    setState(() {
      _selectedCategory = category;
    });
    context.read<PosBloc>().add(FilterProductsEvent(category: category));
  }

  void _onSearchChanged(String query) {
    setState(() {
      _searchQuery = query;
    });
    context.read<PosBloc>().add(SearchProductsEvent(query: query));
  }

  void _addToCart(dynamic product) {
    context.read<CartBloc>().add(
      AddToCartEvent(
        productId: product.id,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
        quantity: 1,
      ),
    );
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Đã thêm ${product.name} vào giỏ hàng'),
        backgroundColor: AppColors.success,
        duration: const Duration(seconds: 1),
      ),
    );
  }

  void _removeFromCart(String productId) {
    context.read<CartBloc>().add(RemoveFromCartEvent(productId: productId));
  }

  void _updateCartQuantity(String productId, int quantity) {
    if (quantity <= 0) {
      _removeFromCart(productId);
    } else {
      context.read<CartBloc>().add(UpdateCartQuantityEvent(
        productId: productId,
        quantity: quantity,
      ));
    }
  }

  void _clearCart() {
    context.read<CartBloc>().add(const ClearCartEvent());
  }

  void _showPaymentSheet() {
    final cartState = context.read<CartBloc>().state;
    if (cartState is CartLoaded && cartState.items.isNotEmpty) {
      showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (context) => PaymentSheet(
          cartItems: cartState.items,
          total: cartState.total,
          onPay: (paymentMethod) {
            context.read<PosBloc>().add(CreateOrderEvent(
              items: cartState.items,
              paymentMethod: paymentMethod,
            ));
            _clearCart();
            Navigator.pop(context);
          },
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'POS',
          style: GoogleFonts.playfairDisplay(
            fontSize: 22,
            fontWeight: FontWeight.w600,
          ),
        ),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.primary,
          indicatorWeight: 3,
          labelStyle: GoogleFonts.inter(
            fontWeight: FontWeight.w600,
            fontSize: 14,
          ),
          unselectedLabelStyle: GoogleFonts.inter(
            fontWeight: FontWeight.normal,
            fontSize: 14,
          ),
          tabs: const [
            Tab(text: 'Bán hàng'),
            Tab(text: 'Đơn hàng'),
            Tab(text: 'Hóa đơn'),
            Tab(text: 'Kho'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [
          _SalesTab(),
          _OrdersTab(),
          _InvoicesTab(),
          _InventoryTab(),
        ],
      ),
    );
  }
}

// ==========================================
// SALES TAB
// ==========================================
class _SalesTab extends StatelessWidget {
  const _SalesTab();

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<PosBloc, PosState>(
      listener: (context, state) {
        if (state is PosError) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.message),
              backgroundColor: Colors.red,
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
        if (state is OrderCreated) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Đơn hàng đã được tạo thành công!'),
              backgroundColor: AppColors.success,
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
      },
      builder: (context, state) {
        final isDesktop = MediaQuery.of(context).size.width > 600;

        return Row(
          children: [
            // Product/Service Grid
            Expanded(
              flex: isDesktop ? 3 : 4,
              child: Column(
                children: [
                  // Search Bar
                  _buildSearchBar(context),
                  
                  // Category chips
                  _buildCategoryChips(context, state),
                  
                  // Products Grid
                  _buildProductsGrid(context, state),
                ],
              ),
            ),
            // Cart
            if (isDesktop)
              Container(
                width: 320,
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  border: Border(
                    left: BorderSide(color: AppColors.divider),
                  ),
                ),
                child: _buildCart(context),
              ),
          ],
        );
      },
    );
  }

  Widget _buildSearchBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: TextField(
        onChanged: (value) {
          context.read<PosScreenState>()._onSearchChanged(value);
        },
        decoration: InputDecoration(
          hintText: 'Tìm dịch vụ, sản phẩm...',
          hintStyle: GoogleFonts.inter(
            color: AppColors.textSecondary,
          ),
          prefixIcon: const Icon(Icons.search, color: AppColors.textSecondary),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          filled: true,
          fillColor: AppColors.surface,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        ),
      ),
    );
  }

  Widget _buildCategoryChips(BuildContext context, PosState state) {
    final categories = state is CategoriesLoaded ? state.categories : <dynamic>[];
    
    return SizedBox(
      height: 44,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: categories.length + 1,
        itemBuilder: (ctx, index) {
          if (index == 0) {
            return PosCategoryChip(
              label: 'Tất cả',
              isSelected: context.read<PosScreenState>()._selectedCategory == 'all',
              onTap: () => context.read<PosScreenState>()._onCategorySelected('all'),
            );
          }
          final category = categories[index - 1];
          return PosCategoryChip(
            label: category.name,
            isSelected: context.read<PosScreenState>()._selectedCategory == category.id,
            onTap: () => context.read<PosScreenState>()._onCategorySelected(category.id),
          );
        },
      ),
    );
  }

  Widget _buildProductsGrid(BuildContext context, PosState state) {
    final products = state is ProductsLoaded ? state.products : <dynamic>[];
    
    if (state is PosLoading && state.isInitial) {
      return const Expanded(
        child: Center(child: LoadingWidget()),
      );
    }

    if (products.isEmpty) {
      return const Expanded(
        child: EmptyStateWidget(
          icon: Icons.store,
          title: 'Chưa có sản phẩm',
          message: 'Thêm sản phẩm và dịch vụ để bắt đầu bán hàng',
          actionLabel: 'Thêm sản phẩm',
          onAction: _navigateToAddProduct,
        ),
      );
    }

    return Expanded(
      child: GridView.builder(
        padding: const EdgeInsets.all(8),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3,
          childAspectRatio: 0.8,
          crossAxisSpacing: 8,
          mainAxisSpacing: 8,
        ),
        itemCount: products.length,
        itemBuilder: (ctx, index) {
          final product = products[index];
          return ProductItem(
            product: product,
            onTap: () => context.read<PosScreenState>()._addToCart(product),
          );
        },
      ),
    );
  }

  Widget _buildCart(BuildContext context) {
    return BlocBuilder<CartBloc, CartState>(
      builder: (context, cartState) {
        if (cartState is! CartLoaded) {
          return const Center(child: LoadingWidget());
        }

        final items = cartState.items;
        final total = cartState.total;

        return Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Text(
                    'Giỏ hàng',
                    style: GoogleFonts.inter(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Spacer(),
                  if (items.isNotEmpty)
                    TextButton(
                      onPressed: () => context.read<PosScreenState>()._clearCart(),
                      child: const Text('Xóa tất cả'),
                    ),
                ],
              ),
            ),
            const Divider(height: 1),

            // Cart Items
            Expanded(
              child: items.isEmpty
                  ? const Center(
                      child: Text(
                        'Chưa có sản phẩm',
                        style: TextStyle(color: AppColors.textSecondary),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      itemCount: items.length,
                      itemBuilder: (ctx, index) {
                        final item = items[index];
                        return CartItem(
                          item: item,
                          onRemove: () => context.read<PosScreenState>()._removeFromCart(item.productId),
                          onQuantityChanged: (quantity) =>
                              context.read<PosScreenState>()._updateCartQuantity(item.productId, quantity),
                        );
                      },
                    ),
            ),
            const Divider(height: 1),

            // Footer
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Row(
                    children: [
                      const Text('Tạm tính:'),
                      const Spacer(),
                      Text(AppFormatters.currency(total)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Text('Giảm giá:'),
                      const Spacer(),
                      Text(
                        AppFormatters.currency(0),
                        style: const TextStyle(color: AppColors.error),
                      ),
                    ],
                  ),
                  const Divider(),
                  Row(
                    children: [
                      Text(
                        'Tổng cộng:',
                        style: GoogleFonts.inter(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        AppFormatters.currency(total),
                        style: GoogleFonts.inter(
                          fontWeight: FontWeight.bold,
                          fontSize: 18,
                          color: AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _showVoucherDialog,
                          icon: const Icon(Icons.card_giftcard, size: 18),
                          label: const Text('Voucher'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _showPointsDialog,
                          icon: const Icon(Icons.star, size: 18),
                          label: const Text('Điểm'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: items.isNotEmpty
                          ? () => context.read<PosScreenState>()._showPaymentSheet()
                          : null,
                      icon: const Icon(Icons.payment),
                      label: const Text('Thanh toán'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  static void _navigateToAddProduct(BuildContext context) {
    // Navigate to add product
  }

  static void _showVoucherDialog(BuildContext context) {
    // Show voucher dialog
  }

  static void _showPointsDialog(BuildContext context) {
    // Show points dialog
  }
}

// ==========================================
// ORDERS TAB
// ==========================================
class _OrdersTab extends StatelessWidget {
  const _OrdersTab();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<PosBloc, PosState>(
      builder: (context, state) {
        if (state is PosLoading && state.isInitial) {
          return const Center(child: LoadingWidget());
        }

        final orders = state is OrdersLoaded ? state.orders : <dynamic>[];

        if (orders.isEmpty) {
          return const EmptyStateWidget(
            icon: Icons.receipt_long,
            title: 'Chưa có đơn hàng',
            message: 'Đơn hàng sẽ hiển thị ở đây sau khi bán hàng',
            actionLabel: 'Bán hàng',
            onAction: _switchToSalesTab,
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: orders.length,
          itemBuilder: (context, index) {
            final order = orders[index];
            return _OrderCard(order: order);
          },
        );
      },
    );
  }

  static void _switchToSalesTab(BuildContext context) {
    // Switch to sales tab
  }
}

// ==========================================
// ORDER CARD
// ==========================================
class _OrderCard extends StatelessWidget {
  final dynamic order;

  const _OrderCard({required this.order});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                order.orderNumber ?? 'Đơn hàng',
                style: GoogleFonts.inter(
                  fontWeight: FontWeight.w600,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: _getStatusColor(order.status).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  _getStatusLabel(order.status),
                  style: TextStyle(
                    color: _getStatusColor(order.status),
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.person, size: 14, color: AppColors.textSecondary),
              const SizedBox(width: 4),
              Text(
                order.customerName ?? 'Khách lẻ',
                style: GoogleFonts.inter(
                  color: AppColors.textSecondary,
                  fontSize: 13,
                ),
              ),
              const Spacer(),
              Text(
                '${order.items?.length ?? 0} sản phẩm',
                style: GoogleFonts.inter(
                  color: AppColors.textSecondary,
                  fontSize: 13,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                AppFormatters.currency(order.totalAmount ?? 0),
                style: GoogleFonts.inter(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary,
                ),
              ),
              TextButton(
                onPressed: () {},
                child: const Text('Xem chi tiết'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'pending': return Colors.orange;
      case 'processing': return AppColors.primary;
      case 'completed': return AppColors.success;
      case 'cancelled': return Colors.red;
      default: return AppColors.textSecondary;
    }
  }

  String _getStatusLabel(String status) {
    switch (status) {
      case 'pending': return 'Chờ thanh toán';
      case 'processing': return 'Đang xử lý';
      case 'completed': return 'Hoàn thành';
      case 'cancelled': return 'Đã hủy';
      default: return status;
    }
  }
}

// ==========================================
// INVOICES TAB
// ==========================================
class _InvoicesTab extends StatelessWidget {
  const _InvoicesTab();

  @override
  Widget build(BuildContext context) {
    return const EmptyStateWidget(
      icon: Icons.description,
      title: 'Chưa có hóa đơn',
      message: 'Hóa đơn sẽ hiển thị sau khi tạo đơn hàng',
      actionLabel: 'Tạo hóa đơn',
      onAction: _navigateToCreateInvoice,
    );
  }

  static void _navigateToCreateInvoice(BuildContext context) {
    // Navigate to create invoice
  }
}

// ==========================================
// INVENTORY TAB
// ==========================================
class _InventoryTab extends StatelessWidget {
  const _InventoryTab();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<PosBloc, PosState>(
      builder: (context, state) {
        if (state is PosLoading && state.isInitial) {
          return const Center(child: LoadingWidget());
        }

        final inventory = state is InventoryLoaded ? state.inventory : <dynamic>[];

        return Column(
          children: [
            // Stats
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: InventoryStat(
                      icon: Icons.warning_amber,
                      label: 'Sắp hết',
                      value: inventory.where((i) => i.quantity <= i.minQuantity).length.toString(),
                      color: AppColors.warning,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: InventoryStat(
                      icon: Icons.error_outline,
                      label: 'Hết hàng',
                      value: inventory.where((i) => i.quantity == 0).length.toString(),
                      color: AppColors.error,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: InventoryStat(
                      icon: Icons.inventory_2,
                      label: 'Tổng SP',
                      value: inventory.length.toString(),
                      color: AppColors.info,
                    ),
                  ),
                ],
              ),
            ),

            // Actions
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                TextButton.icon(
                  onPressed: _navigateToReceiveStock,
                  icon: const Icon(Icons.add_box),
                  label: const Text('Nhập kho'),
                ),
                TextButton.icon(
                  onPressed: _navigateToDispatchStock,
                  icon: const Icon(Icons.outbox),
                  label: const Text('Xuất kho'),
                ),
                TextButton.icon(
                  onPressed: _navigateToTransferStock,
                  icon: const Icon(Icons.swap_horiz),
                  label: const Text('Chuyển kho'),
                ),
              ],
            ),

            // Inventory List
            Expanded(
              child: inventory.isEmpty
                  ? const EmptyStateWidget(
                      icon: Icons.inventory,
                      title: 'Chưa có sản phẩm trong kho',
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: inventory.length,
                      itemBuilder: (context, index) {
                        final item = inventory[index];
                        return _InventoryItem(
                          item: item,
                          onTap: () {},
                        );
                      },
                    ),
            ),
          ],
        );
      },
    );
  }

  static void _navigateToReceiveStock(BuildContext context) {
    // Navigate to receive stock
  }

  static void _navigateToDispatchStock(BuildContext context) {
    // Navigate to dispatch stock
  }

  static void _navigateToTransferStock(BuildContext context) {
    // Navigate to transfer stock
  }
}

// ==========================================
// INVENTORY ITEM
// ==========================================
class _InventoryItem extends StatelessWidget {
  final dynamic item;
  final VoidCallback onTap;

  const _InventoryItem({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final status = item.quantity == 0
        ? 'out_of_stock'
        : item.quantity <= item.minQuantity
            ? 'low_stock'
            : 'in_stock';

    final statusColor = status == 'out_of_stock'
        ? AppColors.error
        : status == 'low_stock'
            ? AppColors.warning
            : AppColors.success;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.productName ?? 'Sản phẩm',
                  style: GoogleFonts.inter(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  'SKU: ${item.sku ?? 'N/A'}',
                  style: GoogleFonts.inter(
                    color: AppColors.textSecondary,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: statusColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '${item.quantity}',
              style: TextStyle(
                color: statusColor,
                fontWeight: FontWeight.bold,
                fontSize: 18,
              ),
            ),
          ),
        ],
      ),
    );
  }
}