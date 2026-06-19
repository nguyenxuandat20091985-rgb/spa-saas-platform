import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/widgets/loading_widget.dart';

class ShopScreen extends StatefulWidget {
  const ShopScreen({super.key});

  @override
  State<ShopScreen> createState() => _ShopScreenState();
}

class _ShopScreenState extends State<ShopScreen> {
  String _selectedCategory = 'all';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Shop', style: GoogleFonts.playfairDisplay()),
        actions: [
          IconButton(
            icon: const Badge(
              label: Text('0'),
              child: Icon(Icons.shopping_cart_outlined),
            ),
            onPressed: () {},
          ),
        ],
      ),
      body: Column(
        children: [
          // Search
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Tìm sản phẩm...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              ),
            ),
          ),

          // Categories
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _CategoryChip(label: 'Tất cả', isSelected: _selectedCategory == 'all', onTap: () => setState(() => _selectedCategory = 'all')),
                _CategoryChip(label: 'Mỹ phẩm', isSelected: _selectedCategory == 'cosmetics', onTap: () => setState(() => _selectedCategory = 'cosmetics')),
                _CategoryChip(label: 'Serum', isSelected: _selectedCategory == 'serum', onTap: () => setState(() => _selectedCategory = 'serum')),
                _CategoryChip(label: 'Collagen', isSelected: _selectedCategory == 'collagen', onTap: () => setState(() => _selectedCategory = 'collagen')),
                _CategoryChip(label: 'Detox', isSelected: _selectedCategory == 'detox', onTap: () => setState(() => _selectedCategory = 'detox')),
                _CategoryChip(label: 'Tinh dầu', isSelected: _selectedCategory == 'oils', onTap: () => setState(() => _selectedCategory = 'oils')),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // Products Grid
          const Expanded(
            child: EmptyStateWidget(
              icon: Icons.shopping_bag_outlined,
              title: 'Chưa có sản phẩm',
              message: 'Sản phẩm sẽ hiển thị khi Spa thêm vào hệ thống',
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _CategoryChip({required this.label, required this.isSelected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: isSelected ? AppColors.primary : AppColors.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: isSelected ? AppColors.primary : AppColors.divider),
          ),
          child: Text(label, style: TextStyle(
            color: isSelected ? Colors.white : AppColors.textSecondary,
            fontSize: 12,
          )),
        ),
      ),
    );
  }
}
