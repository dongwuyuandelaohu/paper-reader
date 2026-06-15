"""
创建测试 PDF 文件
"""

import fitz  # PyMuPDF
from pathlib import Path

def create_test_pdf():
    """创建一个简单的测试 PDF"""
    doc = fitz.open()
    
    # 第 1 页
    page = doc.new_page()
    text = """
    Attention Is All You Need
    
    Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit,
    Llion Jones, Aidan N. Gomez, Łukasz Kaiser, Illia Polosukhin
    
    Abstract
    
    The dominant sequence transduction models are based on complex recurrent or
    convolutional neural networks that include an encoder and a decoder. The best
    performing models also connect the encoder and decoder through an attention
    mechanism. We propose a new simple network architecture, the Transformer,
    based solely on attention mechanisms, dispensing with recurrence and convolutions
    entirely. Experiments on two machine translation tasks show these models to
    be superior in quality while being more parallelizable and requiring significantly
    less time to train.
    """
    
    page.insert_text((72, 72), text, fontsize=11)
    
    # 第 2 页
    page = doc.new_page()
    text2 = """
    1 Introduction
    
    Recurrent neural networks, long short-term memory and gated recurrent neural
    networks in particular, have been firmly established as state of the art approaches
    in sequence modeling and transduction problems such as language modeling and
    machine translation. Numerous efforts have since continued to push the boundaries
    of recurrent language models and encoder-decoder architectures.
    
    Recurrent models typically factor computation along the symbol positions of the
    input and output sequences. Aligning the positions to steps in computation time,
    they generate a sequence of hidden states ht, as a function of the previous hidden
    state ht-1 and the input for position t.
    """
    
    page.insert_text((72, 72), text2, fontsize=11)
    
    # 第 3 页
    page = doc.new_page()
    text3 = """
    2 Background
    
    The goal of reducing sequential computation also forms the foundation of the
    Extended Neural GPU, ByteNet and ConvS2S, all of which use convolutional
    neural networks as basic building block, computing hidden representations in
    parallel for all input and output positions. In these models, the number of
    operations required to relate signals from two arbitrary input or output positions
    grows in the distance between positions, linearly for ConvS2S and logarithmically
    for ByteNet.
    """
    
    page.insert_text((72, 72), text3, fontsize=11)
    
    # 保存 PDF
    output_dir = Path(__file__).parent.parent / "data" / "papers"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_path = output_dir / "test_paper.pdf"
    doc.save(str(output_path))
    doc.close()
    
    print(f"✓ 测试 PDF 已创建: {output_path}")
    print(f"  页数: 3")
    return output_path

if __name__ == "__main__":
    create_test_pdf()
