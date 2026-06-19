import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/utils/formatters.dart';
import 'package:spa_shared/widgets/loading_widget.dart';

class PosScreen extends StatefulWidget {
  const PosScreen({super.key});

  @override
  State<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends State<PosScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('POS', style: GoogleFonts.playfairDisplay()),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.primary,
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

class _SalesTab extends StatelessWidget {
  const _SalesTab();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // Product/Service Grid
        Expanded(
          flex: 3,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: TextField(
                  decoration: InputDecoration(
                    hintText: 'Tìm dịch vụ, sản phẩm...',
                    prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                ),
              ),
              // Category chips
              SizedBox(
                height: 40,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  children: [
                    _CategoryChip(label: 'Tất cả', isSelected: true),
                    _CategoryChip(label: 'Dịch vụ', isSelected: false),
                    _CategoryChip(label: 'Mỹ phẩm', isSelected: false),
                    _CategoryChip(label: 'Combo', isSelected: false),
                  ],
                ),
              ),
              const Expanded(
                child: EmptyStateWidget(
                  icon: Icons.store,
                  title: 'Thêm sản phẩm & dịch vụ',
                  message: 'Tạo danh mục sản phẩm và dịch vụ để bắt đầu bán hàng',
                ),
              ),
            ],
          ),
        ),
        // Cart
        Container(
          width: MediaQuery.of(context).size.width > 600 ? 320 : 0,
          decoration: BoxDecoration(
            color: AppColors.surface,
            border: Border(left: BorderSide(color: AppColors.divider)),
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Text('Giỏ hàng', style: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600)),
                    const Spacer(),
                    TextButton(onPressed: () {}, child: const Text('Xóa')),
                  ],
                ),
              ),
              const Divider(height: 1),
              const Expanded(
                child: Center(child: Text('Chưa có sản phẩm', style: TextStyle(color: AppColors.textSecondary))),
              ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Row(children: [
                      const Text('Tạm tính:'), const Spacer(), Text(AppFormatters.currency(0)),
                    ]),
                    const SizedBox(height: 4),
                    Row(children: [
                      const Text('Giảm giá:'), const Spacer(), Text(AppFormatters.currency(0), style: const TextStyle(color: AppColors.error)),
                    ]),
                    const Divider(),
                    Row(children: [
                      Text('Tổng cộng:', style: GoogleFonts.inter(fontWeight: FontWeight.bold)),
                      const Spacer(),
                      Text(AppFormatters.currency(0), style: GoogleFonts.inter(fontWeight: FontWeight.bold, fontSize: 18, color: AppColors.primary)),
                    ]),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () {},
                            icon: const Icon(Icons.card_giftcard, size: 18),
                            label: const Text('Voucher'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () {},
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
                        onPressed: () {},
                        icon: const Icon(Icons.payment),
                        label: const Text('Thanh toán'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _OrdersTab extends StatelessWidget {
  const _OrdersTab();

  @override
  Widget build(BuildContext context) {
    return const EmptyStateWidget(
      icon: Icons.receipt_long,
      title: 'Chưa có đơn hàng',
      message: 'Đơn hàng sẽ hiển thị ở đây sau khi bán hàng',
    );
  }
}

class _InvoicesTab extends StatelessWidget {
  const _InvoicesTab();

  @override
  Widget build(BuildContext context) {
    return const EmptyStateWidget(
      icon: Icons.description,
      title: 'Chưa có hóa đơn',
    );
  }
}

class _InventoryTab extends StatelessWidget {
  const _InventoryTab();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: _InventoryStat(
                  icon: Icons.warning_amber,
                  label: 'Sắp hết',
                  value: '0',
                  color: AppColors.warning,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _InventoryStat(
                  icon: Icons.error_outline,
                  label: 'Hết hàng',
                  value: '0',
                  color: AppColors.error,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _InventoryStat(
                  icon: Icons.inventory_2,
                  label: 'Tổng SP',
                  value: '0',
                  color: AppColors.info,
                ),
              ),
            ],
          ),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            TextButton.icon(onPressed: () {}, icon: const Icon(Icons.add_box), label: const Text('Nhập kho')),
            TextButton.icon(onPressed: () {}, icon: const Icon(Icons.outbox), label: const Text('Xuất kho')),
            TextButton.icon(onPressed: () {}, icon: const Icon(Icons.swap_horiz), label: const Text('Chuyển kho')),
          ],
        ),
        const Expanded(
          child: EmptyStateWidget(
            icon: Icons.inventory,
            title: 'Chưa có sản phẩm trong kho',
          ),
        ),
      ],
    );
  }
}

class _CategoryChip extends StatelessWidget {
  final String label;
  final bool isSelected;

  const _CategoryChip({required this.label, required this.isSelected});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Chip(
        label: Text(label, style: TextStyle(
          color: isSelected ? Colors.white : AppColors.textSecondary,
          fontSize: 12,
        )),
        backgroundColor: isSelected ? AppColors.primary : AppColors.surface,
        side: BorderSide(color: isSelected ? AppColors.primary : AppColors.divider),
      ),
    );
  }
}

class _InventoryStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _InventoryStat({required this.icon, required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: color)),
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}
